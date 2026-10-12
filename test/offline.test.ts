import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOfflineQueue, MemoryStorageAdapter } from '../src/offline/index.js';
import { HttpError, NetworkError, ConfigError } from '../src/errors.js';
import type { HttpResponse, RequestConfig, HttpMethod } from '../src/types.js';

describe('Offline Request Queue', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  const mockClient = (
    handler: (config: RequestConfig & { url: string; method: HttpMethod }) => Promise<HttpResponse>,
  ) => ({
    request: vi.fn().mockImplementation(handler),
  });

  const createSuccessResponse = (data: unknown, url = '/test'): HttpResponse => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    config: {
      url,
      method: 'GET',
      headers: {},
      timeout: 0,
      responseType: 'json',
      retry: {
        attempts: 0,
        backoff: 'exponential',
        delay: 1000,
        maxDelay: 30000,
        jitter: true,
        retryOn: [429, 500, 502, 503, 504],
        safeMethods: ['GET'],
        respectRetryAfter: true,
      },
    },
    cached: false,
    fromDedup: false,
    request: new Request('http://localhost' + url),
  });

  describe('Persistence and Serialization', () => {
    it('persists enqueued requests to storage', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({ client, storage });

      const res = await queue.enqueue({
        url: '/api/todos',
        method: 'POST',
        body: { title: 'Buy groceries' },
      });

      expect(res.enqueued).toBe(true);
      expect(await queue.size()).toBe(1);

      // Verify serialized state in storage
      const rawStored = storage.getItem('fnc_offline_queue');
      expect(rawStored).toBeTruthy();
      const parsed = JSON.parse(rawStored ?? '[]') as Array<{
        url: string;
        body: string;
        idempotencyKey: string;
      }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.url).toBe('/api/todos');
      expect(parsed[0]?.body).toBe(JSON.stringify({ title: 'Buy groceries' }));
      expect(parsed[0]?.idempotencyKey).toBe(res.id);
    });

    it('rejects unsupported bodies like FormData upfront', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({ client, storage });

      // FormData cannot be safely serialized to cold storage
      if (typeof FormData !== 'undefined') {
        const formData = new FormData();
        formData.append('key', 'val');
        await expect(
          queue.enqueue({ url: '/upload', method: 'POST', body: formData }),
        ).rejects.toThrow(ConfigError);
      }
    });
  });

  describe('Duplicate Prevention and Idempotency', () => {
    it('assigns unique Idempotency-Key if not provided by caller', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({ client, storage });

      const item1 = await queue.enqueue({ url: '/items', method: 'POST' });
      const item2 = await queue.enqueue({ url: '/items', method: 'POST' });

      expect(item1.id).not.toBe(item2.id);

      const items = await queue.getItems();
      expect(items[0]?.idempotencyKey).toBe(item1.id);
      expect(items[1]?.idempotencyKey).toBe(item2.id);
      expect(items[0]?.headers?.['idempotency-key']).toBe(item1.id);
    });

    it('preserves caller-supplied Idempotency-Key', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({ client, storage });

      await queue.enqueue({
        url: '/items',
        method: 'POST',
        headers: { 'Idempotency-Key': 'custom-key-123' },
      });

      const items = await queue.getItems();
      expect(items[0]?.idempotencyKey).toBe('custom-key-123');
    });
  });

  describe('Payment and Critical Mutation Protection', () => {
    it('strictly forbids queuing payment, order, and checkout mutations by default', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({ client, storage });

      await expect(queue.enqueue({ url: '/api/pay', method: 'POST' })).rejects.toThrow(ConfigError);
      await expect(queue.enqueue({ url: '/checkout/step2', method: 'POST' })).rejects.toThrow(
        ConfigError,
      );
      await expect(queue.enqueue({ url: '/orders', method: 'POST' })).rejects.toThrow(ConfigError);
      await expect(queue.enqueue({ url: '/billing/charge', method: 'POST' })).rejects.toThrow(
        ConfigError,
      );
    });

    it('respects custom disallowedUrls regex', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));
      const queue = createOfflineQueue({
        client,
        storage,
        disallowedUrls: [/\/sensitive-action/i],
      });

      await expect(queue.enqueue({ url: '/sensitive-action', method: 'POST' })).rejects.toThrow(
        ConfigError,
      );
    });
  });

  describe('App Restart and Recovery', () => {
    it('hydrates queue from persistent storage across new instance creation', async () => {
      const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));

      // Instance 1 enqueues an action
      const queue1 = createOfflineQueue({ client, storage });
      await queue1.enqueue({ url: '/task1', method: 'POST' });
      await queue1.enqueue({ url: '/task2', method: 'POST' });
      expect(await queue1.size()).toBe(2);

      // Simulate App Restart: Create new queue instance reading from same storage
      const queue2 = createOfflineQueue({ client, storage });
      await queue2.initialize();

      expect(await queue2.size()).toBe(2);
      const items = await queue2.getItems();
      expect(items[0]?.url).toBe('/task1');
      expect(items[1]?.url).toBe('/task2');
    });

    it('purges expired entries upon hydration', async () => {
      vi.useFakeTimers();
      try {
        const client = mockClient(() => Promise.resolve(createSuccessResponse({ ok: true })));

        const queue1 = createOfflineQueue({
          client,
          storage,
          maxAgeMs: 5000, // 5 seconds
        });

        await queue1.enqueue({ url: '/stale-task', method: 'POST' });
        expect(await queue1.size()).toBe(1);

        // Fast forward 6 seconds
        vi.advanceTimersByTime(6000);

        // Simulate app restart after expiry
        const queue2 = createOfflineQueue({
          client,
          storage,
          maxAgeMs: 5000,
        });

        await queue2.initialize();
        expect(await queue2.size()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Replay, Ordering, and Poison-Pill Handling', () => {
    it('replays requests sequentially in strict FIFO order', async () => {
      const executionOrder: string[] = [];
      const client = mockClient((req) => {
        executionOrder.push(req.url);
        return Promise.resolve(createSuccessResponse({ ok: true }, req.url));
      });

      const queue = createOfflineQueue({ client, storage });

      await queue.enqueue({ url: '/step1', method: 'POST' });
      await queue.enqueue({ url: '/step2', method: 'POST' });
      await queue.enqueue({ url: '/step3', method: 'POST' });

      const summary = await queue.process();

      expect(summary.processed).toBe(3);
      expect(summary.succeeded).toBe(3);
      expect(summary.remaining).toBe(0);
      expect(executionOrder).toEqual(['/step1', '/step2', '/step3']);
      expect(await queue.size()).toBe(0);
    });

    it('halts processing on NetworkError without dropping remaining items', async () => {
      let callCount = 0;
      const client = mockClient((req) => {
        callCount++;
        if (req.url === '/offline-step') {
          return Promise.reject(new NetworkError('Device offline'));
        }
        return Promise.resolve(createSuccessResponse({ ok: true }, req.url));
      });

      const queue = createOfflineQueue({ client, storage });

      await queue.enqueue({ url: '/offline-step', method: 'POST' });
      await queue.enqueue({ url: '/waiting-step', method: 'POST' });

      const summary = await queue.process();

      expect(summary.failedTransient).toBe(1);
      expect(summary.remaining).toBe(2);
      expect(callCount).toBe(1); // Halts immediately, /waiting-step was not called
    });

    it('drops permanent failures (4xx) to avoid poison-pill queue blockages', async () => {
      const onPermanentFailure = vi.fn();
      const client = mockClient((req) => {
        if (req.url === '/bad-request') {
          return Promise.reject(
            new HttpError('Bad Request', {
              status: 400,
              statusText: 'Bad Request',
              data: { error: 'invalid payload' },
              headers: {},
              response: new Response('Bad Request', { status: 400 }),
              config: {
                url: req.url,
                method: req.method,
                headers: {},
                timeout: 0,
                responseType: 'json',
                retry: {
                  attempts: 0,
                  backoff: 'exponential',
                  delay: 1000,
                  maxDelay: 30000,
                  jitter: true,
                  retryOn: [],
                  safeMethods: ['GET'],
                  respectRetryAfter: true,
                },
              },
            }),
          );
        }
        return Promise.resolve(createSuccessResponse({ ok: true }, req.url));
      });

      const queue = createOfflineQueue({
        client,
        storage,
        onPermanentFailure,
      });

      await queue.enqueue({ url: '/bad-request', method: 'POST' });
      await queue.enqueue({ url: '/valid-step', method: 'POST' });

      const summary = await queue.process();

      expect(summary.failedPermanent).toBe(1);
      expect(summary.succeeded).toBe(1);
      expect(summary.remaining).toBe(0);
      expect(onPermanentFailure).toHaveBeenCalledTimes(1);
      expect(await queue.size()).toBe(0);
    });

    it('evicts requests after exceeding maxAttempts', async () => {
      const onPermanentFailure = vi.fn();
      const client = mockClient(() => Promise.reject(new NetworkError('Transient drop')));

      const queue = createOfflineQueue({
        client,
        storage,
        maxAttempts: 2,
        onPermanentFailure,
      });

      await queue.enqueue({ url: '/flaky-endpoint', method: 'POST' });

      // Attempt 1 -> transient fail
      await queue.process();
      expect(await queue.size()).toBe(1);

      // Attempt 2 -> max attempts reached, should be dropped
      const summary = await queue.process();
      expect(summary.failedPermanent).toBe(1);
      expect(await queue.size()).toBe(0);
      expect(onPermanentFailure).toHaveBeenCalledTimes(1);
    });
  });
});
