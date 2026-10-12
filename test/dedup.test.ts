import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { generateDedupKey, isDedupEligible } from '../src/dedup.js';
import { CancelError, NetworkError } from '../src/errors.js';

describe('Request Deduplication', () => {
  describe('generateDedupKey', () => {
    it('generates identical keys regardless of query parameter ordering', () => {
      const key1 = generateDedupKey('GET', 'http://localhost/items?b=2&a=1');
      const key2 = generateDedupKey('GET', 'http://localhost/items?a=1&b=2');
      expect(key1).toBe(key2);
    });

    it('generates different keys for different methods or paths', () => {
      const keyGet = generateDedupKey('GET', 'http://localhost/items');
      const keyHead = generateDedupKey('HEAD', 'http://localhost/items');
      const keyOtherPath = generateDedupKey('GET', 'http://localhost/users');

      expect(keyGet).not.toBe(keyHead);
      expect(keyGet).not.toBe(keyOtherPath);
    });

    it('accounts for relevant headers and credentials', () => {
      const key1 = generateDedupKey(
        'GET',
        'http://localhost/items',
        { accept: 'application/json' },
        'include',
      );
      const key2 = generateDedupKey(
        'GET',
        'http://localhost/items',
        { accept: 'text/plain' },
        'include',
      );
      const key3 = generateDedupKey(
        'GET',
        'http://localhost/items',
        { accept: 'application/json' },
        'omit',
      );

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe('isDedupEligible', () => {
    it('is disabled by default', () => {
      expect(isDedupEligible('GET')).toBe(false);
      expect(isDedupEligible('GET', undefined, { enabled: false })).toBe(false);
    });

    it('only allows safe methods (GET, HEAD) by default when enabled', () => {
      expect(isDedupEligible('GET', true)).toBe(true);
      expect(isDedupEligible('HEAD', { enabled: true })).toBe(true);
      expect(isDedupEligible('POST', true)).toBe(false);
      expect(isDedupEligible('PUT', true)).toBe(false);
      expect(isDedupEligible('DELETE', true)).toBe(false);
    });

    it('allows explicit methods configuration override', () => {
      expect(isDedupEligible('POST', { enabled: true, methods: ['POST', 'GET'] })).toBe(true);
    });

    it('allows per-request disable override', () => {
      expect(isDedupEligible('GET', false, { enabled: true })).toBe(false);
    });
  });

  describe('In-Flight Concurrency & Sharing', () => {
    it('does not deduplicate requests when disabled by default', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      const [res1, res2] = await Promise.all([
        client.get('/concurrent-no-dedup'),
        client.get('/concurrent-no-dedup'),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res1.fromDedup).toBe(false);
      expect(res2.fromDedup).toBe(false);
    });

    it('deduplicates concurrent identical GET requests into a single network call', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(JSON.stringify([1, 2, 3]), { status: 200 });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      const [res1, res2, res3] = await Promise.all([
        client.get<number[]>('/items'),
        client.get<number[]>('/items'),
        client.get<number[]>('/items'),
      ]);

      // Exactly 1 network fetch call dispatched
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Primary caller has fromDedup: false, secondary callers have fromDedup: true
      expect(res1.fromDedup).toBe(false);
      expect(res2.fromDedup).toBe(true);
      expect(res3.fromDedup).toBe(true);

      // All callers receive the exact data
      expect(res1.data).toEqual([1, 2, 3]);
      expect(res2.data).toEqual([1, 2, 3]);
      expect(res3.data).toEqual([1, 2, 3]);
    });

    it('never deduplicates unsafe mutation methods (POST, PUT, DELETE) by default', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ created: true }), { status: 201 });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      await Promise.all([client.post('/orders', { item: 1 }), client.post('/orders', { item: 1 })]);

      // POST mutations are unsafe and MUST NOT be deduplicated
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('cleans up in-flight map after success so subsequent calls make new requests', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ val: Math.random() }), { status: 200 }),
        );
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      // Call 1 settles
      await client.get('/subsequent');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call 2 after Call 1 settled makes a fresh request
      await client.get('/subsequent');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('propagates failure to all waiting callers and cleans up in-flight map', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return Promise.reject(new TypeError('Connection reset'));
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      const results = await Promise.allSettled([
        client.get('/fail-dedup'),
        client.get('/fail-dedup'),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
      expect((results[0] as PromiseRejectedResult).reason).toBeInstanceOf(NetworkError);
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(NetworkError);

      // Map is clean: subsequent call makes a fresh request
      await expect(client.get('/fail-dedup')).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cancellation Semantics across Shared Consumers', () => {
    it('allows secondary caller to abort without cancelling primary caller', async () => {
      let abortedSignal: boolean | undefined;
      const mockFetch = vi.fn().mockImplementation(async (req: Request) => {
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            abortedSignal = req.signal.aborted;
            resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
          }, 60);
        });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      const primaryPromise = client.get<{ ok: boolean }>('/shared-cancel-1');

      const controllerSecondary = new AbortController();
      const secondaryPromise = client.get<{ ok: boolean }>('/shared-cancel-1', {
        signal: controllerSecondary.signal,
      });

      // Secondary aborts after 15ms
      setTimeout(() => controllerSecondary.abort(), 15);

      // Secondary rejects with CancelError
      await expect(secondaryPromise).rejects.toThrow(CancelError);

      // Primary caller continues and succeeds!
      const primaryRes = await primaryPromise;
      expect(primaryRes.data).toEqual({ ok: true });
      expect(abortedSignal).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('allows primary caller to abort without cancelling secondary caller', async () => {
      let abortedSignal: boolean | undefined;
      const mockFetch = vi.fn().mockImplementation(async (req: Request) => {
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            abortedSignal = req.signal.aborted;
            resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
          }, 60);
        });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      const controllerPrimary = new AbortController();
      const primaryPromise = client.get<{ ok: boolean }>('/shared-cancel-2', {
        signal: controllerPrimary.signal,
      });

      const secondaryPromise = client.get<{ ok: boolean }>('/shared-cancel-2');

      // Primary aborts after 15ms
      setTimeout(() => controllerPrimary.abort(), 15);

      // Primary rejects with CancelError
      await expect(primaryPromise).rejects.toThrow(CancelError);

      // Secondary caller continues and succeeds!
      const secondaryRes = await secondaryPromise;
      expect(secondaryRes.data).toEqual({ ok: true });
      expect(secondaryRes.fromDedup).toBe(true);
      expect(abortedSignal).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('aborts the underlying network request when ALL subscribers cancel', async () => {
      let fetchAborted = false;
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        return new Promise<Response>((_, reject) => {
          req.signal.addEventListener('abort', () => {
            fetchAborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        dedup: { enabled: true },
      });

      const c1 = new AbortController();
      const c2 = new AbortController();

      const p1 = client.get('/both-cancel', { signal: c1.signal });
      const p2 = client.get('/both-cancel', { signal: c2.signal });

      // Both abort after 20ms
      setTimeout(() => {
        c1.abort();
        c2.abort();
      }, 20);

      await expect(p1).rejects.toThrow(CancelError);
      await expect(p2).rejects.toThrow(CancelError);

      // Because all subscribers cancelled, underlying network call was aborted!
      expect(fetchAborted).toBe(true);
    });
  });
});
