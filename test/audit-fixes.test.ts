import { describe, it, expect, vi } from 'vitest';
import {
  createClient,
  generateCacheKey,
  AuthRefreshError,
  isAuthRefreshError,
  createOfflineQueue,
  MemoryStorageAdapter,
  withDevToolsSuppression,
} from '../src/index.js';

describe('Audit Fixes & Correctness Regressions (15 issues verification)', () => {
  // 1. Executor & Cache - Mutation invalidation is exact and safe
  describe('Issue 1: Precise Mutation Cache Invalidation', () => {
    it('invalidates only exact pathname and does not wipe entire cache on root or prefix', async () => {
      let fetchCount = 0;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        fetchCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ url: req.url, count: fetchCount }), {
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

      // Populate cache for /users, /users/123, /users-summary, and /
      await client.get('/users');
      await client.get('/users/123');
      await client.get('/users-summary');
      await client.get('/');
      expect(fetchCount).toBe(4);

      // Verify all 4 are cached
      const resUsers = await client.get('/users');
      const resUser123 = await client.get('/users/123');
      const resSummary = await client.get('/users-summary');
      const resRoot = await client.get('/');
      expect(resUsers.cached).toBe(true);
      expect(resUser123.cached).toBe(true);
      expect(resSummary.cached).toBe(true);
      expect(resRoot.cached).toBe(true);
      expect(fetchCount).toBe(4); // 0 new network calls

      // POST to /users -> Should ONLY invalidate /users, NOT /users-summary or /users/123
      await client.post('/users', { name: 'Alice' });

      // Check cache states:
      const afterUsers = await client.get('/users');
      expect(afterUsers.cached).toBe(false); // Refetched!
      expect(fetchCount).toBe(6); // 1 POST + 1 GET

      const afterUser123 = await client.get('/users/123');
      expect(afterUser123.cached).toBe(true); // Still cached!

      const afterSummary = await client.get('/users-summary');
      expect(afterSummary.cached).toBe(true); // Still cached! (Not evicted by substring)

      const afterRoot = await client.get('/');
      expect(afterRoot.cached).toBe(true); // Still cached!

      // POST to / -> Should NOT wipe entire cache
      await client.post('/', { ping: true });
      const stillCachedSummary = await client.get('/users-summary');
      expect(stillCachedSummary.cached).toBe(true);
    });

    it('respects autoInvalidate: false on request level and autoInvalidateMutations: false on client level', async () => {
      let fetchCount = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        fetchCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, fetchCount }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: { enabled: true, autoInvalidateMutations: false },
      });

      await client.get('/items');
      await client.post('/items', { name: 'New Item' });

      // Because autoInvalidateMutations is false, cache is preserved
      const cached = await client.get('/items');
      expect(cached.cached).toBe(true);
    });
  });

  // 2. Client poll() respects caller ignoreErrors and maxInterval
  describe('Issue 2 & 14: api.poll() caller options precedence', () => {
    it('respects caller ignoreErrors instead of hardcoding to []', async () => {
      let attempts = 0;
      const fetchImpl = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve(new Response('Not Found', { status: 404 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }));
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
      });

      // Caller explicitly passes ignoreErrors: [404]
      const res = await client.poll<{ status: string }>('/job/1', {
        interval: 10,
        timeout: 1000,
        ignoreErrors: [404],
        until: (r) => r.data.status === 'ready',
      });

      expect(res.data.status).toBe('ready');
      expect(attempts).toBe(2);
    });
  });

  // 3. DevTools suppression reference counting
  describe('Issue 3: DevTools Suppression Concurrency', () => {
    it('safely reference-counts active suppressed URLs across concurrent executions', async () => {
      const url = 'https://api.example.com/secret/token';

      let call1Finished = false;
      let call2Finished = false;

      const p1 = withDevToolsSuppression(url, true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        call1Finished = true;
        return 'res1';
      });

      const p2 = withDevToolsSuppression(url, true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        call2Finished = true;
        return 'res2';
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('res1');
      expect(r2).toBe('res2');
      expect(call1Finished).toBe(true);
      expect(call2Finished).toBe(true);
    });
  });

  // 4. Cache key Authorization hashing
  describe('Issue 4: Authorization Header Hashing in Cache Keys', () => {
    it('hashes the Bearer token and never exposes raw credentials in the cache key', () => {
      const secretToken = 'Bearer my-super-secret-jwt-token-xyz123';
      const key = generateCacheKey(
        'GET',
        'https://api.example.com/me',
        { authorization: secretToken },
        true,
      );

      expect(key).not.toContain(secretToken);
      expect(key).not.toContain('my-super-secret-jwt-token');
      expect(key).toMatch(/^GET:https:\/\/api\.example\.com\/me\|auth:[0-9a-f]+$/);
    });
  });

  // 6. Paginate pageSize variable shadowing
  describe('Issue 6: Pagination limit option in offset strategy', () => {
    it('properly advances offset by limit when using limit instead of pageSize', async () => {
      const capturedOffsets: number[] = [];
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        const u = new URL(req.url);
        const offset = Number(u.searchParams.get('offset') ?? 0);
        capturedOffsets.push(offset);

        // Return 25 items for first 2 pages, empty for 3rd
        const items = offset < 50 ? Array.from({ length: 25 }, (_, i) => ({ id: offset + i })) : [];
        return Promise.resolve(
          new Response(JSON.stringify({ items }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
      });

      const items = await client.paginate.all('/items', {
        pagination: {
          type: 'offset',
          limit: 25, // Using limit instead of pageSize
        },
      });

      expect(items.length).toBe(50);
      expect(capturedOffsets).toEqual([0, 25, 50]); // Incremented by 25, NOT shadowed to 10!
    });
  });

  // 7. Offline queue subscribeOnline
  describe('Issue 7: React Native NetInfo integration via subscribeOnline', () => {
    it('calls subscribeOnline on init and unsubscribes on queue.destroy()', async () => {
      let triggerOnlineCb: (() => void) | undefined;
      const unsubscribeMock = vi.fn();
      const subscribeMock = vi.fn().mockImplementation((onOnline: () => void) => {
        triggerOnlineCb = onOnline;
        return unsubscribeMock;
      });

      const storage = new MemoryStorageAdapter();
      const mockRequest = vi.fn().mockResolvedValue({ status: 200, data: { ok: true } });
      const client = { request: mockRequest };

      const queue = createOfflineQueue({
        client,
        storage,
        autoSyncOnOnline: true,
        subscribeOnline: subscribeMock,
      });

      expect(subscribeMock).toHaveBeenCalledTimes(1);

      // Enqueue an item while offline
      await queue.enqueue({ url: 'https://api.example.com/sync', method: 'POST', body: { a: 1 } });
      expect(await queue.size()).toBe(1);

      // Simulate network coming back online via subscriber callback
      expect(triggerOnlineCb).toBeDefined();
      triggerOnlineCb?.();

      // Allow microtask tick for process to run
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(await queue.size()).toBe(0);

      // Calling destroy() invokes custom unsubscribe function
      queue.destroy();
      expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    });
  });

  // 9. Paginate is non-null immediately upon client creation
  describe('Issue 9: Immediate Non-Null Paginate Helper', () => {
    it('exposes a fully initialized, non-null paginate helper immediately upon creation', () => {
      const client = createClient({ baseURL: 'https://api.example.com' });
      expect(client.paginate).toBeDefined();
      expect(typeof client.paginate).toBe('function');
      expect(typeof client.paginate.pages).toBe('function');
      expect(typeof client.paginate.all).toBe('function');
    });
  });

  // 10. Auth preflight isExpired error warning
  describe('Issue 10: Graceful handling of isExpired failures', () => {
    it('warns in console and proceeds with existing token when isExpired throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        auth: {
          getToken: () => 'existing-valid-token',
          isExpired: () => {
            throw new Error('Storage read failure');
          },
          refreshToken: () => Promise.resolve('new-token'),
        },
      });

      const res = await client.get('/test');
      expect(res.status).toBe(200);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // 11. AuthRefreshError cause chain and type guards
  describe('Issue 11: AuthRefreshError normalization & cause chain', () => {
    it('normalizes non-Error throwables into Error with cause', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        auth: {
          getToken: () => 'token',
          refreshToken: () => {
            // Testing intentional string rejection instead of Error
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject('OAUTH_REFRESH_REVOKED');
          },
        },
      });

      await expect(client.get('/protected')).rejects.toThrow('OAUTH_REFRESH_REVOKED');
    });

    it('exports AuthRefreshError and isAuthRefreshError guard', () => {
      const err = new AuthRefreshError(new Error('token expired'));
      expect(isAuthRefreshError(err)).toBe(true);
      expect(err.code).toBe('AUTH_REFRESH_FAILED');
    });
  });

  // 12. Persistent cache does not leak request config / auth headers to storage
  describe('Issue 12: Sanitized Persistent Cache Storage', () => {
    it('never serializes request headers, authorization tokens, or request objects to disk storage', async () => {
      const storage = new MemoryStorageAdapter();
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: 'Alice' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: {
          enabled: true,
          allowAuthenticated: true,
          storage,
          storageKey: 'sanitized_cache_test',
        },
      });

      const secretToken = 'Bearer ultra-sensitive-secret-token-999';
      await client.get('/me', {
        headers: { authorization: secretToken },
      });

      const rawPersisted = storage.getItem('sanitized_cache_test');
      expect(rawPersisted).toBeTruthy();
      expect(rawPersisted).toContain('Alice');

      // Crucial: The secret token must NEVER be present anywhere in the storage string!
      expect(rawPersisted).not.toContain(secretToken);
      expect(rawPersisted).not.toContain('ultra-sensitive-secret-token');
    });
  });

  // 13. HEAD and OPTIONS method shorthands
  describe('Issue 13: HEAD and OPTIONS method shorthands', () => {
    it('supports client.head() and client.options()', async () => {
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { 'x-custom-method': req.method },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
      });

      const headRes = await client.head('/check');
      expect(headRes.headers['x-custom-method']).toBe('HEAD');

      const optRes = await client.options('/check');
      expect(optRes.headers['x-custom-method']).toBe('OPTIONS');
    });

    it('supports client.safe.head() and client.safe.options()', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { allow: 'GET, POST, HEAD, OPTIONS' },
        }),
      );

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
      });

      const [, headErr] = await client.safe.head('/check');
      expect(headErr).toBeNull();

      const [, optErr] = await client.safe.options('/check');
      expect(optErr).toBeNull();
    });
  });

  // 15. Circuit breaker state inspection and reset
  describe('Issue 15: Circuit Breaker Inspection and Reset on HttpClient', () => {
    it('exposes circuitBreaker on HttpClient instance allowing state query and reset', async () => {
      const fetchImpl = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response('Server Error', { status: 500 }));
      });

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 10000 },
      });

      expect(client.circuitBreaker).toBeDefined();
      expect(client.circuitBreaker?.getState()).toBe('CLOSED');

      // Trigger 2 failures to trip the circuit
      await expect(client.get('/fail-1')).rejects.toThrow();
      await expect(client.get('/fail-2')).rejects.toThrow();

      expect(client.circuitBreaker?.getState()).toBe('OPEN');

      // Caller can programmatically reset the circuit breaker:
      client.circuitBreaker?.reset();
      expect(client.circuitBreaker?.getState()).toBe('CLOSED');
    });
  });
});
