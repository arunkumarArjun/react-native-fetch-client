import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../src/client.js';
import { CacheManager, generateCacheKey, isCacheEligible } from '../src/cache.js';
import type { HttpResponse } from '../src/types.js';

describe('Phase 7: In-Memory Response Caching', () => {
  describe('CacheManager unit tests', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager({ enabled: true, defaultTtl: 1000, maxSize: 3 });
    });

    const mockResponse = (data: unknown, url = '/test'): HttpResponse => ({
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
          safeMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
          respectRetryAfter: true,
        },
      },
      cached: false,
      fromDedup: false,
      request: new Request('http://localhost' + url),
    });

    it('stores and retrieves cached response with cached: true', () => {
      const resp = mockResponse({ message: 'hello' });
      cache.set('key1', resp);

      const retrieved = cache.get<{ message: string }>('key1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.data).toEqual({ message: 'hello' });
      expect(retrieved?.cached).toBe(true);
      expect(cache.has('key1')).toBe(true);
      expect(cache.size).toBe(1);
    });

    it('deep-clones response data so mutating retrieved data does not mutate cached data', () => {
      const resp = mockResponse({ count: 1, nested: { list: [1, 2] } });
      cache.set('key1', resp);

      const retrieved1 = cache.get<{ count: number; nested: { list: number[] } }>('key1');
      expect(retrieved1).toBeDefined();
      if (retrieved1) {
        retrieved1.data.count = 999;
        retrieved1.data.nested.list.push(3);
      }

      const retrieved2 = cache.get<{ count: number; nested: { list: number[] } }>('key1');
      expect(retrieved2?.data.count).toBe(1);
      expect(retrieved2?.data.nested.list).toEqual([1, 2]);
    });

    it('deep-clones data on set so mutating original response object does not mutate cached data', () => {
      const originalData = { title: 'v1' };
      const resp = mockResponse(originalData);
      cache.set('key1', resp);

      originalData.title = 'v2';

      const retrieved = cache.get<{ title: string }>('key1');
      expect(retrieved?.data.title).toBe('v1');
    });

    it('expires entries after TTL', () => {
      vi.useFakeTimers();
      try {
        const resp = mockResponse({ message: 'expires' });
        cache.set('key1', resp, 500); // 500ms TTL

        expect(cache.get('key1')).toBeDefined();

        vi.advanceTimersByTime(501);

        expect(cache.get('key1')).toBeUndefined();
        expect(cache.has('key1')).toBe(false);
        expect(cache.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('enforces LRU eviction when exceeding maxSize', () => {
      cache.set('k1', mockResponse('val1'));
      cache.set('k2', mockResponse('val2'));
      cache.set('k3', mockResponse('val3'));

      expect(cache.size).toBe(3);

      // Access k1, making it most recently used. LRU order becomes: k2, k3, k1
      cache.get('k1');

      // Adding k4 should evict k2
      cache.set('k4', mockResponse('val4'));

      expect(cache.get('k2')).toBeUndefined();
      expect(cache.get('k1')).toBeDefined();
      expect(cache.get('k3')).toBeDefined();
      expect(cache.get('k4')).toBeDefined();
    });

    it('supports delete, deletePattern, and clear', () => {
      cache.set('GET:/users/1', mockResponse('u1'));
      cache.set('GET:/users/2', mockResponse('u2'));
      cache.set('GET:/posts/1', mockResponse('p1'));

      expect(cache.delete('GET:/posts/1')).toBe(true);
      expect(cache.get('GET:/posts/1')).toBeUndefined();

      // deletePattern using string
      const deleted = cache.deletePattern('/users/');
      expect(deleted).toBe(2);
      expect(cache.size).toBe(0);

      // clear
      cache.set('a', mockResponse('a'));
      cache.set('b', mockResponse('b'));
      expect(cache.size).toBe(2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('generateCacheKey and isCacheEligible', () => {
    it('sorts query parameters stably', () => {
      const k1 = generateCacheKey('GET', 'http://api.com/items?b=2&a=1');
      const k2 = generateCacheKey('GET', 'http://api.com/items?a=1&b=2');
      expect(k1).toBe(k2);
      expect(k1).toBe('GET:http://api.com/items?a=1&b=2');
    });

    it('includes auth token hash in cache key only when allowAuthenticated is true without leaking secrets', () => {
      const headers = { authorization: 'Bearer user123' };
      const unauthKey = generateCacheKey('GET', '/items', headers, false);
      expect(unauthKey).toBe('GET:/items');

      const authKey = generateCacheKey('GET', '/items', headers, true);
      expect(authKey).toMatch(/^GET:\/items\|auth:[0-9a-f]+$/);
      expect(authKey).not.toContain('Bearer user123'); // Never leak raw credentials in cache keys
    });

    it('denies cache eligibility for unsafe methods', () => {
      expect(isCacheEligible('POST', {}, true, { enabled: true })).toBe(false);
      expect(isCacheEligible('PUT', {}, true, { enabled: true })).toBe(false);
      expect(isCacheEligible('DELETE', {}, true, { enabled: true })).toBe(false);
      expect(isCacheEligible('PATCH', {}, true, { enabled: true })).toBe(false);
    });

    it('respects request-level skip and false', () => {
      expect(isCacheEligible('GET', {}, false, { enabled: true })).toBe(false);
      expect(isCacheEligible('GET', {}, { skip: true }, { enabled: true })).toBe(false);
    });

    it('skips authenticated requests by default when allowAuthenticated is false', () => {
      const headers = { authorization: 'Bearer secret' };
      expect(isCacheEligible('GET', headers, true, { enabled: true })).toBe(false);
      expect(
        isCacheEligible('GET', headers, true, { enabled: true, allowAuthenticated: true }),
      ).toBe(true);
    });
  });

  describe('Client integration tests', () => {
    it('serves cached response on second GET request and sets cached: true', async () => {
      let callCount = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ count: callCount, name: 'Alice' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true, defaultTtl: 5000 },
      });

      const res1 = await client.get<{ count: number; name: string }>('/profile');
      expect(res1.cached).toBe(false);
      expect(res1.data.count).toBe(1);
      expect(callCount).toBe(1);

      const res2 = await client.get<{ count: number; name: string }>('/profile');
      expect(res2.cached).toBe(true);
      expect(res2.data.count).toBe(1);
      expect(callCount).toBe(1); // No new network call
    });

    it('respects request-level cache: false to bypass cache', async () => {
      let callCount = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ value: callCount }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true },
      });

      const res1 = await client.get<{ value: number }>('/data');
      expect(res1.cached).toBe(false);
      expect(res1.data.value).toBe(1);

      // Bypass cache
      const res2 = await client.get<{ value: number }>('/data', { cache: false });
      expect(res2.cached).toBe(false);
      expect(res2.data.value).toBe(2);
      expect(callCount).toBe(2);
    });

    it('expires cached response after request-level custom TTL', async () => {
      vi.useFakeTimers();
      try {
        let callCount = 0;
        const fetchImpl = vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(
            new Response(JSON.stringify({ count: callCount }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        });

        const client = createClient({
          baseURL: 'https://api.example.com',
          fetchImpl,
          cache: { enabled: true, defaultTtl: 60000 },
        });

        const p1 = client.get<{ count: number }>('/short-lived', { cache: { ttl: 200 } });
        await vi.advanceTimersByTimeAsync(1);
        const res1 = await p1;
        expect(res1.cached).toBe(false);
        expect(callCount).toBe(1);

        // Advance 250ms -> cache should expire
        await vi.advanceTimersByTimeAsync(250);

        const p2 = client.get<{ count: number }>('/short-lived', { cache: { ttl: 200 } });
        await vi.advanceTimersByTimeAsync(1);
        const res2 = await p2;
        expect(res2.cached).toBe(false);
        expect(callCount).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('invalidates cache automatically when mutation (POST/PUT/DELETE) succeeds on same path', async () => {
      let getCount = 0;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        if (req.method === 'GET') {
          getCount++;
          return Promise.resolve(
            new Response(JSON.stringify({ items: ['a', 'b'] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        if (req.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ success: true }), {
              status: 201,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true },
      });

      // 1. Initial GET - cache miss
      const res1 = await client.get('/items');
      expect(res1.cached).toBe(false);
      expect(getCount).toBe(1);

      // 2. Second GET - cache hit
      const res2 = await client.get('/items');
      expect(res2.cached).toBe(true);
      expect(getCount).toBe(1);

      // 3. POST mutation to /items
      await client.post('/items', { name: 'c' });

      // 4. Third GET - cache should be invalidated
      const res3 = await client.get('/items');
      expect(res3.cached).toBe(false);
      expect(getCount).toBe(2);
    });

    it('isolates cache per authenticated user when allowAuthenticated is true', async () => {
      let callCount = 0;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        callCount++;
        const auth = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ user: auth, call: callCount }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true, allowAuthenticated: true },
      });

      // User A
      const resA1 = await client.get<{ user: string; call: number }>('/me', {
        headers: { authorization: 'Bearer user-A' },
      });
      expect(resA1.cached).toBe(false);
      expect(resA1.data.user).toBe('Bearer user-A');
      expect(callCount).toBe(1);

      // User A repeat - cache hit
      const resA2 = await client.get<{ user: string; call: number }>('/me', {
        headers: { authorization: 'Bearer user-A' },
      });
      expect(resA2.cached).toBe(true);
      expect(callCount).toBe(1);

      // User B - different auth header -> MUST NOT hit User A cache
      const resB1 = await client.get<{ user: string; call: number }>('/me', {
        headers: { authorization: 'Bearer user-B' },
      });
      expect(resB1.cached).toBe(false);
      expect(resB1.data.user).toBe('Bearer user-B');
      expect(callCount).toBe(2);
    });

    it('does not cache authenticated requests if allowAuthenticated is false', async () => {
      let callCount = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ data: 'secret' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true, allowAuthenticated: false },
      });

      await client.get('/secret', { headers: { authorization: 'Bearer token' } });
      await client.get('/secret', { headers: { authorization: 'Bearer token' } });

      // Should never cache
      expect(callCount).toBe(2);
      expect(client.cache.size).toBe(0);
    });

    it('exposes client.cache for manual invalidation', async () => {
      const fetchImpl = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ data: 'value' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true },
      });

      await client.get('/dashboard');
      expect(client.cache.size).toBe(1);

      client.cache.clear();
      expect(client.cache.size).toBe(0);
    });
  });
});
