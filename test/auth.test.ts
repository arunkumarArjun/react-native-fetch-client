import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { HttpError, CancelError } from '../src/errors.js';

describe('Authentication & Token Refresh', () => {
  it('attaches token to outgoing requests with default Bearer prefix', async () => {
    let capturedAuth: string | null = null;
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      capturedAuth = req.headers.get('authorization');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'initial-token-123',
      },
    });

    const res = await client.get('/profile');
    expect(res.status).toBe(200);
    expect(capturedAuth).toBe('Bearer initial-token-123');
    // Secret must be redacted in config
    expect(res.config.headers['authorization']).toBe('[REDACTED]');
  });

  it('preserves explicitly configured authorization headers and does not overwrite', async () => {
    let capturedAuth: string | null = null;
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      capturedAuth = req.headers.get('authorization');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'auto-token',
      },
    });

    await client.get('/custom', {
      headers: {
        Authorization: 'CustomExplicitToken',
      },
    });

    expect(capturedAuth).toBe('CustomExplicitToken');
  });

  it('skips token attachment when auth is explicitly set to false or skip: true', async () => {
    let capturedAuth: string | null = null;
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      capturedAuth = req.headers.get('authorization');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'my-token',
      },
    });

    await client.get('/public-1', { auth: false });
    expect(capturedAuth).toBeNull();

    await client.get('/public-2', { auth: { skip: true } });
    expect(capturedAuth).toBeNull();
  });

  it('deduplicates concurrent refresh operations using single-flight (3 requests -> 1 refresh call)', async () => {
    let currentToken = 'old-expired-token';
    const refreshFn = vi.fn().mockImplementation(async () => {
      // Simulate async token refresh latency
      await new Promise((resolve) => setTimeout(resolve, 30));
      currentToken = 'new-valid-token';
      return currentToken;
    });

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const auth = req.headers.get('authorization');
      if (auth === 'Bearer old-expired-token') {
        return Promise.resolve(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ url: req.url, auth }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => currentToken,
        refreshToken: refreshFn,
      },
    });

    // Launch 3 concurrent requests hitting 401 simultaneously
    const [res1, res2, res3] = await Promise.all([
      client.get<{ url: string; auth: string }>('/resource-1'),
      client.get<{ url: string; auth: string }>('/resource-2'),
      client.get<{ url: string; auth: string }>('/resource-3'),
    ]);

    // Refresh function MUST be called exactly once
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // All 3 requests must successfully resolve with the new token
    expect(res1.data.auth).toBe('Bearer new-valid-token');
    expect(res2.data.auth).toBe('Bearer new-valid-token');
    expect(res3.data.auth).toBe('Bearer new-valid-token');

    // Total fetch calls = 3 original (which got 401) + 3 retries = 6 calls
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('prevents infinite refresh loops if retried request still returns 401', async () => {
    const refreshFn = vi.fn().mockResolvedValue('new-token-still-forbidden');

    const mockFetch = vi.fn().mockImplementation(() => {
      // Server perpetually rejects with 401
      return Promise.resolve(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'token',
        refreshToken: refreshFn,
      },
    });

    await expect(client.get('/forbidden')).rejects.toThrow(HttpError);

    // Refresh must be called at most once for this request, not looped infinitely
    expect(refreshFn).toHaveBeenCalledTimes(1);
    // Initial request + 1 retried request = 2 fetch calls total
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('propagates error to all concurrent callers if refreshToken throws', async () => {
    const refreshError = new Error('Refresh token revoked');
    const refreshFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw refreshError;
    });

    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
      );
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'token',
        refreshToken: refreshFn,
      },
    });

    const results = await Promise.allSettled([client.get('/fail-1'), client.get('/fail-2')]);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect((results[0] as PromiseRejectedResult).reason).toBe(refreshError);
    expect((results[1] as PromiseRejectedResult).reason).toBe(refreshError);
  });

  it('does not trigger refresh for excluded URLs (e.g. refresh endpoint)', async () => {
    const refreshFn = vi.fn().mockResolvedValue('token');

    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response('Invalid Refresh Token', { status: 401, statusText: 'Unauthorized' }),
      );
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'token',
        refreshToken: refreshFn,
        refreshExcludeUrls: ['/auth/refresh', /\/auth\/login/],
      },
    });

    await expect(client.post('/auth/refresh')).rejects.toThrow(HttpError);
    await expect(client.post('/auth/login')).rejects.toThrow(HttpError);

    // Refresh callback must NOT be triggered for excluded endpoints
    expect(refreshFn).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('allows fresh refresh on subsequent requests after earlier refresh completes', async () => {
    let currentToken = 'token-1';
    let refreshCount = 0;
    const refreshFn = vi.fn().mockImplementation(() => {
      refreshCount++;
      currentToken = `token-${refreshCount + 1}`;
      return Promise.resolve(currentToken);
    });

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const auth = req.headers.get('authorization');
      if (auth === 'Bearer token-1' || auth === 'Bearer token-2') {
        return Promise.resolve(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => currentToken,
        refreshToken: refreshFn,
      },
    });

    // First request: token-1 -> 401 -> refresh to token-2 -> token-2 still 401 -> fails
    await expect(client.get('/first')).rejects.toThrow(HttpError);
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // Second separate request later: token-2 -> 401 -> refresh to token-3 -> token-3 succeeds!
    const res = await client.get('/second');
    expect(refreshFn).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('respects cancellation while a request is waiting for token refresh', async () => {
    const refreshFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return 'new-token';
    });

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const auth = req.headers.get('authorization');
      if (auth === 'Bearer old-token') {
        return Promise.resolve(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'http://localhost',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'old-token',
        refreshToken: refreshFn,
      },
    });

    const controller = new AbortController();
    const reqPromise = client.get('/cancel-waiting', { signal: controller.signal });

    // Cancel after 20ms while in the middle of 80ms refresh
    setTimeout(() => controller.abort(), 20);

    await expect(reqPromise).rejects.toThrow(CancelError);
  });
});
