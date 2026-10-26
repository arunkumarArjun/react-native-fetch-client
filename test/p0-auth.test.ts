import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { CancelError } from '../src/errors.js';

describe('P0 Authentication and Cancellation Safety Tests', () => {
  it('triggers only ONE token refresh for multiple concurrent 401s and replays all with the new token', async () => {
    let currentToken = 'expired-token-123';
    let refreshCalls = 0;
    const receivedTokens: string[] = [];

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const authHeader = req.headers.get('authorization');
      receivedTokens.push(authHeader ?? 'none');

      if (authHeader === 'Bearer refreshed-token-456') {
        return Promise.resolve(
          new Response(JSON.stringify({ secret: 'authorized-data' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

      // Return 401 Unauthorized for expired token
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'token_expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => currentToken,
        refreshToken: async () => {
          refreshCalls++;
          // Simulate async refresh latency
          await new Promise((r) => setTimeout(r, 20));
          currentToken = 'refreshed-token-456';
          return currentToken;
        },
      },
    });

    // 5 concurrent requests fired at the same time
    const promises = Array.from({ length: 5 }, (_, i) =>
      client.get<{ secret: string }>(`/resource-${i}`),
    );

    const results = await Promise.all(promises);

    // Exactly one refresh operation occurred
    expect(refreshCalls).toBe(1);

    // All 5 requests received data successfully
    for (const res of results) {
      expect(res.status).toBe(200);
      expect(res.data.secret).toBe('authorized-data');
    }

    // After refresh, all replayed requests sent the refreshed token
    const replayedTokens = receivedTokens.filter((t) => t === 'Bearer refreshed-token-456');
    expect(replayedTokens.length).toBe(5);
  });

  it('correctly replaces expired token on 401 retry even if request had explicit authorization header', async () => {
    let currentToken = 'expired-token';
    let refreshCount = 0;
    const headersSent: string[] = [];

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const token = req.headers.get('authorization');
      headersSent.push(token ?? '');
      if (token === 'Bearer fresh-token') {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => currentToken,
        refreshToken: () => {
          refreshCount++;
          currentToken = 'fresh-token';
          return Promise.resolve(currentToken);
        },
      },
    });

    // Request with an explicit stale header
    const res = await client.get<{ ok: boolean }>('/secure', {
      headers: { authorization: 'Bearer expired-token' },
    });

    expect(refreshCount).toBe(1);
    expect(res.data.ok).toBe(true);
    expect(headersSent[0]).toBe('Bearer expired-token');
    expect(headersSent[1]).toBe('Bearer fresh-token');
  });

  it('rejects all waiting requests if token refresh fails', async () => {
    let refreshAttempts = 0;

    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      auth: {
        getToken: () => 'bad-token',
        refreshToken: async () => {
          refreshAttempts++;
          await new Promise((r) => setTimeout(r, 15));
          throw new Error('Refresh token revoked');
        },
      },
    });

    const p1 = client.get('/req-1');
    const p2 = client.get('/req-2');

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    expect(refreshAttempts).toBe(1);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    const r1Err = (r1 as PromiseRejectedResult).reason as Error;
    const r2Err = (r2 as PromiseRejectedResult).reason as Error;
    expect(r1Err.message).toContain('Refresh token revoked');
    expect(r2Err.message).toContain('Refresh token revoked');
  });

  it('does NOT retry when an abort signal is triggered', async () => {
    let fetchCount = 0;
    const abortCtrl = new AbortController();

    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      fetchCount++;
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      retry: { attempts: 3, delay: 10 },
    });

    const p = client.get('/abort-test', { signal: abortCtrl.signal });

    setTimeout(() => {
      abortCtrl.abort();
    }, 15);

    const err: unknown = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CancelError);
    // Should NOT have performed 3 retries
    expect(fetchCount).toBe(1);
  });
});
