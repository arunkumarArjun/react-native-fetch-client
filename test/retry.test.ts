import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '../src/client.js';
import {
  parseRetryAfter,
  calculateRetryDelay,
  shouldRetry,
  DEFAULT_RETRY_POLICY,
  sleep,
} from '../src/retry.js';
import {
  HttpError,
  NetworkError,
  CancelError,
  TimeoutError,
  RetryExhaustedError,
} from '../src/errors.js';
import type { ResolvedRequestConfig, ResolvedRetryPolicy } from '../src/types.js';

describe('Retry Engine', () => {
  describe('parseRetryAfter', () => {
    it('parses seconds correctly', () => {
      expect(parseRetryAfter('120')).toBe(120_000);
      expect(parseRetryAfter('0')).toBe(0);
      expect(parseRetryAfter('  5  ')).toBe(5000);
    });

    it('parses HTTP date format', () => {
      const futureDate = new Date(Date.now() + 10_000).toUTCString();
      const result = parseRetryAfter(futureDate);
      expect(result).toBeGreaterThanOrEqual(9000);
      expect(result).toBeLessThanOrEqual(11000);
    });

    it('returns null for invalid or missing values', () => {
      expect(parseRetryAfter(undefined)).toBeNull();
      expect(parseRetryAfter(null)).toBeNull();
      expect(parseRetryAfter('')).toBeNull();
      expect(parseRetryAfter('invalid')).toBeNull();
    });
  });

  describe('calculateRetryDelay', () => {
    const policy: ResolvedRetryPolicy = {
      attempts: 3,
      backoff: 'exponential',
      delay: 1000,
      maxDelay: 10000,
      jitter: false,
      retryOn: [500],
      safeMethods: ['GET'],
      respectRetryAfter: true,
    };

    it('calculates exponential backoff without jitter', () => {
      expect(calculateRetryDelay(1, policy)).toBe(1000);
      expect(calculateRetryDelay(2, policy)).toBe(2000);
      expect(calculateRetryDelay(3, policy)).toBe(4000);
      expect(calculateRetryDelay(4, policy)).toBe(8000);
      expect(calculateRetryDelay(5, policy)).toBe(10000); // capped at maxDelay
    });

    it('calculates linear backoff without jitter', () => {
      const linearPolicy: ResolvedRetryPolicy = { ...policy, backoff: 'linear' };
      expect(calculateRetryDelay(1, linearPolicy)).toBe(1000);
      expect(calculateRetryDelay(2, linearPolicy)).toBe(2000);
      expect(calculateRetryDelay(3, linearPolicy)).toBe(3000);
    });

    it('applies jitter using injected random function', () => {
      const jitterPolicy: ResolvedRetryPolicy = { ...policy, jitter: true };
      const halfRandom = () => 0.5;
      expect(calculateRetryDelay(1, jitterPolicy, undefined, halfRandom)).toBe(500);
      expect(calculateRetryDelay(2, jitterPolicy, undefined, halfRandom)).toBe(1000);
    });

    it('uses Retry-After header when present and respected', () => {
      const dummyConfig = { url: 'http://localhost' } as unknown as ResolvedRequestConfig;
      const httpError = new HttpError('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        data: null,
        headers: { 'retry-after': '5' },
        response: new Response(null, { status: 429 }),
        config: dummyConfig,
      });

      expect(calculateRetryDelay(1, policy, httpError)).toBe(5000);
    });

    it('caps Retry-After at maxDelay', () => {
      const dummyConfig = { url: 'http://localhost' } as unknown as ResolvedRequestConfig;
      const httpError = new HttpError('Rate limited', {
        status: 429,
        statusText: 'Too Many Requests',
        data: null,
        headers: { 'retry-after': '60' }, // 60s > 10s maxDelay
        response: new Response(null, { status: 429 }),
        config: dummyConfig,
      });

      expect(calculateRetryDelay(1, policy, httpError)).toBe(10000);
    });
  });

  describe('shouldRetry', () => {
    const baseConfig: ResolvedRequestConfig = {
      url: 'http://localhost',
      method: 'GET',
      headers: {},
      timeout: 0,
      responseType: 'json',
      retry: {
        ...DEFAULT_RETRY_POLICY,
        attempts: 2,
      },
    };

    it('retries server errors on safe methods', () => {
      const err500 = new HttpError('Error', {
        status: 500,
        statusText: 'Server Error',
        data: null,
        headers: {},
        response: new Response(null, { status: 500 }),
        config: baseConfig,
      });
      expect(shouldRetry(err500, 1, baseConfig)).toBe(true);
      expect(shouldRetry(err500, 2, baseConfig)).toBe(true);
      expect(shouldRetry(err500, 3, baseConfig)).toBe(false); // exceeds 2 attempts
    });

    it('does not retry 4xx errors by default (except 429)', () => {
      const err404 = new HttpError('Not Found', {
        status: 404,
        statusText: 'Not Found',
        data: null,
        headers: {},
        response: new Response(null, { status: 404 }),
        config: baseConfig,
      });
      const err400 = new HttpError('Bad Request', {
        status: 400,
        statusText: 'Bad Request',
        data: null,
        headers: {},
        response: new Response(null, { status: 400 }),
        config: baseConfig,
      });
      expect(shouldRetry(err404, 1, baseConfig)).toBe(false);
      expect(shouldRetry(err400, 1, baseConfig)).toBe(false);
    });

    it('does not retry unsafe methods (POST, PATCH) by default', () => {
      const postConfig: ResolvedRequestConfig = { ...baseConfig, method: 'POST' };
      const err500 = new HttpError('Error', {
        status: 500,
        statusText: 'Server Error',
        data: null,
        headers: {},
        response: new Response(null, { status: 500 }),
        config: postConfig,
      });
      expect(shouldRetry(err500, 1, postConfig)).toBe(false);
    });

    it('retries POST when safeMethods explicitly includes POST', () => {
      const postConfig: ResolvedRequestConfig = {
        ...baseConfig,
        method: 'POST',
        retry: {
          ...baseConfig.retry,
          safeMethods: ['POST', 'GET'],
        },
      };
      const err500 = new HttpError('Error', {
        status: 500,
        statusText: 'Server Error',
        data: null,
        headers: {},
        response: new Response(null, { status: 500 }),
        config: postConfig,
      });
      expect(shouldRetry(err500, 1, postConfig)).toBe(true);
    });

    it('retries NetworkError by default', () => {
      const netErr = new NetworkError('Failed to fetch', { config: baseConfig });
      expect(shouldRetry(netErr, 1, baseConfig)).toBe(true);
    });

    it('never retries CancelError or TimeoutError', () => {
      const cancelErr = new CancelError({ config: baseConfig });
      const timeoutErr = new TimeoutError(1000, { config: baseConfig });
      expect(shouldRetry(cancelErr, 1, baseConfig)).toBe(false);
      expect(shouldRetry(timeoutErr, 1, baseConfig)).toBe(false);
    });

    it('supports custom retryCondition', () => {
      const customConfig: ResolvedRequestConfig = {
        ...baseConfig,
        retry: {
          ...baseConfig.retry,
          retryCondition: (error, attempt) => {
            return attempt === 1 && error instanceof HttpError && error.status === 418;
          },
        },
      };

      const teapotErr = new HttpError('Teapot', {
        status: 418,
        statusText: "I'm a teapot",
        data: null,
        headers: {},
        response: new Response(null, { status: 418 }),
        config: customConfig,
      });

      expect(shouldRetry(teapotErr, 1, customConfig)).toBe(true);
      expect(shouldRetry(teapotErr, 2, customConfig)).toBe(false);
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves after specified milliseconds', async () => {
      let resolved = false;
      const promise = sleep(100).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(resolved).toBe(true);
    });

    it('rejects immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(sleep(100, controller.signal)).rejects.toThrow();
    });

    it('rejects immediately when signal aborts during sleep', async () => {
      const controller = new AbortController();
      const promise = sleep(1000, controller.signal);

      controller.abort();
      await expect(promise).rejects.toThrow();
    });
  });

  describe('End-to-End Client Retries', () => {
    it('recovers after a transient 500 error', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response('Server Error', { status: 500, statusText: 'Server Error' }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ recovered: true }), { status: 200 }));
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 2,
          delay: 1,
          jitter: false,
        },
      });

      const res = await client.get('/transient');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ recovered: true });
    });

    it('recovers after a transient NetworkError', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new TypeError('Network offline'));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 2,
          delay: 1,
          jitter: false,
        },
      });

      const res = await client.get('/network-retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.data).toEqual({ ok: true });
    });

    it('throws RetryExhaustedError when all retry attempts fail', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' }),
          ),
        );

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 2,
          delay: 1,
          jitter: false,
        },
      });

      let caughtErr: unknown;
      try {
        await client.get('/unavailable');
      } catch (err) {
        caughtErr = err;
      }

      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(caughtErr).toBeInstanceOf(RetryExhaustedError);
      const exhausted = caughtErr as RetryExhaustedError;
      expect(exhausted.attempts).toBe(3);
      expect(exhausted.lastError).toBeInstanceOf(HttpError);
      expect((exhausted.lastError as HttpError).status).toBe(503);
    });

    it('does not retry 404 Not Found and throws HttpError immediately', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 3,
          delay: 1,
          jitter: false,
        },
      });

      await expect(client.get('/not-found')).rejects.toThrow(HttpError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry POST requests automatically by default', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response('Internal Error', { status: 500, statusText: 'Internal Error' }),
        );

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 3,
          delay: 1,
          jitter: false,
        },
      });

      await expect(client.post('/mutate', { item: 1 })).rejects.toThrow(HttpError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('respects cancellation during backoff sleep', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' }),
        );

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 3,
          delay: 1000,
          jitter: false,
        },
      });

      const controller = new AbortController();
      const reqPromise = client.get('/cancel-during-retry', { signal: controller.signal });

      // Abort shortly after initial failure while in backoff sleep
      setTimeout(() => controller.abort(), 20);

      await expect(reqPromise).rejects.toThrow(CancelError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('enforces total request timeout across all attempts', async () => {
      const mockFetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response('Server Error', { status: 500, statusText: 'Server Error' }),
          ),
        );

      const client = createClient({
        baseURL: 'http://localhost',
        fetchImpl: mockFetch as unknown as typeof fetch,
        retry: {
          attempts: 5,
          delay: 50,
          jitter: false,
        },
      });

      // Total timeout of 60ms; with 50ms delays, attempt 2 should exceed total timeout
      await expect(client.get('/timeout-all', { timeout: 60 })).rejects.toThrow(TimeoutError);
    });
  });
});
