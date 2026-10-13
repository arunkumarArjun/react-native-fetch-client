import { describe, it, expect } from 'vitest';
import { createClient, createMockAdapter, TimeoutError } from '../src/index.js';

describe('V0.1.3 Enhancements & Ergonomics', () => {
  it('attaches durationMs to HttpResponse on successful requests and cache hits', async () => {
    const api = createClient({
      baseURL: 'https://api.example.com',
      cache: { enabled: true, defaultTtl: 5000 },
    });
    const mock = createMockAdapter(api);

    mock.onGet('/items').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 10));
      return [200, [{ id: 1, name: 'Item 1' }]];
    });

    // Network request
    const res1 = await api.get<Array<{ id: number; name: string }>>('/items');
    expect(res1.status).toBe(200);
    expect(typeof res1.durationMs).toBe('number');
    expect(res1.durationMs).toBeGreaterThanOrEqual(5);
    expect(res1.cached).toBe(false);

    // Cache hit
    const res2 = await api.get<Array<{ id: number; name: string }>>('/items');
    expect(res2.cached).toBe(true);
    expect(typeof res2.durationMs).toBe('number');
    expect(res2.durationMs).toBeLessThanOrEqual(50);
  });

  it('proactively refreshes auth token before dispatching when isExpired returns true', async () => {
    let token = 'initial-expired-token';
    let refreshCalls = 0;

    const api = createClient({
      baseURL: 'https://api.example.com',
      auth: {
        getToken: () => token,
        isExpired: () => true, // Flagged as expired proactively
        refreshToken: () => {
          refreshCalls++;
          token = 'freshly-renewed-token';
          return Promise.resolve(token);
        },
      },
    });

    const mock = createMockAdapter(api);
    mock.onGet('/secure-data').reply(200, { secret: 42 });

    const res = await api.get('/secure-data');
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(mock.history.get[0]?.headers?.authorization).toBe('Bearer freshly-renewed-token');
  });

  it('declaratively invalidates specified cache patterns on mutation', async () => {
    const api = createClient({
      baseURL: 'https://api.example.com',
      cache: { enabled: true, defaultTtl: 60000 },
    });
    const mock = createMockAdapter(api);

    mock.onGet('/users').reply(200, [{ id: 1 }, { id: 2 }]);
    mock.onPut('/users/1').reply(200, { id: 1, name: 'Updated' });

    // Populate /users cache
    const initialGet = await api.get('/users');
    expect(initialGet.cached).toBe(false);

    const cachedGet = await api.get('/users');
    expect(cachedGet.cached).toBe(true);

    // Mutate /users/1 with declarative invalidation of /users
    await api.put(
      '/users/1',
      { name: 'Updated' },
      {
        cache: { invalidate: ['/users'] },
      },
    );

    // Next get to /users should hit network, not cache
    const invalidatedGet = await api.get('/users');
    expect(invalidatedGet.cached).toBe(false);
  });

  it('calls onRevalidationError when background SWR revalidation fails', async () => {
    let swrCallCount = 0;
    const api = createClient({
      baseURL: 'https://api.example.com',
      cache: { enabled: true, defaultTtl: 10, defaultStrategy: 'stale-while-revalidate' },
    });
    const mock = createMockAdapter(api);

    mock.onGet('/feed').reply((): [number, unknown] => {
      swrCallCount++;
      if (swrCallCount === 1) {
        return [200, { posts: ['Post 1'] }];
      }
      // Revalidation fails
      return [500, { error: 'Server broke' }];
    });

    // Populate initial cache
    await api.get('/feed');

    // Wait for TTL to expire so it becomes stale
    await new Promise((r) => setTimeout(r, 20));

    let errorCaptured: unknown;
    const revalRes = await api.get('/feed', {
      cache: {
        strategy: 'stale-while-revalidate',
        onRevalidationError: (err) => {
          errorCaptured = err;
        },
      },
    });

    // Immediate stale response
    expect(revalRes.stale).toBe(true);

    // Wait for background revalidation
    await new Promise((r) => setTimeout(r, 50));
    expect(errorCaptured).toBeDefined();
  });

  it('auto-aborts previous in-flight request in the same cancelPrevious group', async () => {
    const api = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(api);

    mock.onGet('/search?q=a').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 40));
      return [200, { results: ['apple'] }];
    });
    mock.onGet('/search?q=ap').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 10));
      return [200, { results: ['apple', 'application'] }];
    });

    const p1 = api.get('/search?q=a', { cancelPrevious: 'autocomplete' });
    // Rapidly dispatch next search with same group
    const p2 = api.get('/search?q=ap', { cancelPrevious: 'autocomplete' });

    // p1 should reject with CancelError
    await expect(p1).rejects.toThrow();

    // p2 should resolve successfully
    const res2 = await p2;
    expect(res2.status).toBe(200);
    expect(res2.data).toEqual({ results: ['apple', 'application'] });
  });

  it('polls until predicate returns true', async () => {
    const api = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(api);

    let pollAttempts = 0;
    mock.onGet('/jobs/123').reply((): [number, unknown] => {
      pollAttempts++;
      if (pollAttempts < 3) {
        return [200, { status: 'PENDING' }];
      }
      return [200, { status: 'COMPLETED', result: 'Success' }];
    });

    const completed = await api.poll<{ status: string; result?: string }>('/jobs/123', {
      interval: 15,
      until: (res) => res.data.status === 'COMPLETED',
    });

    expect(completed.data.status).toBe('COMPLETED');
    expect(completed.data.result).toBe('Success');
    expect(pollAttempts).toBe(3);
  });

  it('throws TimeoutError if polling exceeds maximum timeout', async () => {
    const api = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(api);

    mock.onGet('/jobs/slow').reply(200, { status: 'PENDING' });

    await expect(
      api.poll('/jobs/slow', {
        interval: 20,
        timeout: 50,
        until: () => false, // never matches
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});
