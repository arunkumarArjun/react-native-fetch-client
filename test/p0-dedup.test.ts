import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { generateDedupKey } from '../src/dedup.js';
import { CancelError } from '../src/errors.js';

describe('P0 Request Deduplication Tests', () => {
  it('dedup key distinguishes different responseType values', () => {
    const keyJson = generateDedupKey(
      'GET',
      'https://api.example.com/data',
      {},
      undefined,
      undefined,
      'json',
    );
    const keyBlob = generateDedupKey(
      'GET',
      'https://api.example.com/data',
      {},
      undefined,
      undefined,
      'blob',
    );
    const keyText = generateDedupKey(
      'GET',
      'https://api.example.com/data',
      {},
      undefined,
      undefined,
      'text',
    );

    expect(keyJson).not.toBe(keyBlob);
    expect(keyJson).not.toBe(keyText);
    expect(keyBlob).not.toBe(keyText);
  });

  it('dedup key distinguishes different tenant and user headers (x-tenant-id, x-organization-id)', () => {
    const keyTenantA = generateDedupKey('GET', 'https://api.example.com/items', {
      'X-Tenant-Id': 'tenant-a',
    });
    const keyTenantB = generateDedupKey('GET', 'https://api.example.com/items', {
      'X-Tenant-Id': 'tenant-b',
    });

    expect(keyTenantA).not.toBe(keyTenantB);

    const keyOrg1 = generateDedupKey('GET', 'https://api.example.com/items', {
      'x-organization-id': 'org-1',
    });
    const keyOrg2 = generateDedupKey('GET', 'https://api.example.com/items', {
      'x-organization-id': 'org-2',
    });

    expect(keyOrg1).not.toBe(keyOrg2);
  });

  it('dedup key does not store raw authorization tokens in plaintext', () => {
    const rawSecret = 'SUPER_SECRET_BEARER_TOKEN_999';
    const key = generateDedupKey('GET', 'https://api.example.com/profile', {
      authorization: `Bearer ${rawSecret}`,
    });

    expect(key).not.toContain(rawSecret);
  });

  it('executes 10 concurrent identical GET requests as exactly one network flight', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ count: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      dedup: { enabled: true },
    });

    const requests = Array.from({ length: 10 }, () => client.get<{ count: number }>('/shared'));
    const results = await Promise.all(requests);

    expect(callCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    results.forEach((res) => {
      expect(res.data.count).toBe(42);
    });
  });

  it('does not deduplicate requests asking for different responseTypes', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response('{"status":"ok"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      dedup: { enabled: true },
    });

    const [resJson, resText] = await Promise.all([
      client.get('/content', { responseType: 'json' }),
      client.get('/content', { responseType: 'text' }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(resJson.data).toEqual({ status: 'ok' });
    expect(resText.data).toBe('{"status":"ok"}');
  });

  it('does not deduplicate requests from different tenants (x-tenant-id)', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const tenant = req.headers.get('x-tenant-id');
      return Promise.resolve(new Response(JSON.stringify({ tenant }), { status: 200 }));
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      dedup: { enabled: true },
    });

    const [resA, resB] = await Promise.all([
      client.get<{ tenant: string }>('/data', { headers: { 'x-tenant-id': 'alpha' } }),
      client.get<{ tenant: string }>('/data', { headers: { 'x-tenant-id': 'beta' } }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(resA.data.tenant).toBe('alpha');
    expect(resB.data.tenant).toBe('beta');
  });

  it('allows remaining callers to succeed when one caller aborts', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return new Response(JSON.stringify({ message: 'done' }), { status: 200 });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      dedup: { enabled: true },
    });

    const abortCtrl = new AbortController();

    const p1 = client.get<{ message: string }>('/test', { signal: abortCtrl.signal });
    const p2 = client.get<{ message: string }>('/test');

    setTimeout(() => {
      abortCtrl.abort();
    }, 10);

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    expect(r1.status).toBe('rejected');
    expect((r1 as PromiseRejectedResult).reason).toBeInstanceOf(CancelError);

    expect(r2.status).toBe('fulfilled');
    expect((r2 as PromiseFulfilledResult<{ data: { message: string } }>).value.data.message).toBe(
      'done',
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('aborts the underlying network request when ALL participating callers abort', async () => {
    let fetchAborted = false;
    const mockFetch = vi.fn().mockImplementation((req: Request, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal ?? req.signal;
        signal?.addEventListener('abort', () => {
          fetchAborted = true;
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      dedup: { enabled: true },
    });

    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();

    const p1 = client.get('/all-abort', { signal: ctrl1.signal });
    const p2 = client.get('/all-abort', { signal: ctrl2.signal });

    setTimeout(() => {
      ctrl1.abort();
      ctrl2.abort();
    }, 10);

    await Promise.allSettled([p1, p2]);

    expect(fetchAborted).toBe(true);
  });
});
