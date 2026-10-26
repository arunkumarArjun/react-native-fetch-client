import { describe, it, expect, vi } from 'vitest';
import { generateCacheKey } from '../src/cache.js';
import { createClient } from '../src/client.js';
import type { CacheStorageAdapter } from '../src/types.js';

describe('P0 Cache Isolation and Reliability Tests', () => {
  it('cache key distinguishes different responseType values', () => {
    const keyJson = generateCacheKey(
      'GET',
      'https://api.example.com/data',
      undefined,
      false,
      'json',
    );
    const keyBlob = generateCacheKey(
      'GET',
      'https://api.example.com/data',
      undefined,
      false,
      'blob',
    );
    const keyText = generateCacheKey(
      'GET',
      'https://api.example.com/data',
      undefined,
      false,
      'text',
    );

    expect(keyJson).not.toBe(keyBlob);
    expect(keyJson).not.toBe(keyText);
    expect(keyBlob).not.toBe(keyText);
  });

  it('cache key distinguishes different tenant and user headers (x-tenant-id, x-organization-id)', () => {
    const keyTenantA = generateCacheKey('GET', 'https://api.example.com/items', {
      'x-tenant-id': 'tenant-alpha',
    });
    const keyTenantB = generateCacheKey('GET', 'https://api.example.com/items', {
      'x-tenant-id': 'tenant-beta',
    });
    const keyNoTenant = generateCacheKey('GET', 'https://api.example.com/items');

    expect(keyTenantA).not.toBe(keyTenantB);
    expect(keyTenantA).not.toBe(keyNoTenant);
    expect(keyTenantA).toContain('x-tenant-id=tenant-alpha');
  });

  it('cold start: ensures persisted data is hydrated before cache lookup', async () => {
    const store = new Map<string, string>();
    const mockStorage: CacheStorageAdapter = {
      getItem: vi.fn().mockImplementation(async (key: string) => {
        // Simulate async I/O delay
        await new Promise((resolve) => setTimeout(resolve, 20));
        return store.get(key) ?? null;
      }),
      setItem: vi.fn().mockImplementation((key: string, val: string) => {
        store.set(key, val);
        return Promise.resolve();
      }),
      removeItem: vi.fn().mockImplementation((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    };

    // 1. First client creates and persists cache
    const mockFetch1 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client1 = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch1 as unknown as typeof fetch,
      cache: { enabled: true, storage: mockStorage, ttl: 60000 },
    });

    const res1 = await client1.get<{ value: number }>('/persisted');
    expect(res1.data.value).toBe(42);
    expect(mockFetch1).toHaveBeenCalledTimes(1);

    // Wait for async persistence to finish
    await client1.cache.persist();

    // 2. Second client boots cold with the same persistent storage
    const mockFetch2 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: 999 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client2 = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch2 as unknown as typeof fetch,
      cache: { enabled: true, storage: mockStorage, ttl: 60000 },
    });

    // Immediate request on cold start must wait for hydration and hit cache
    const res2 = await client2.get<{ value: number }>('/persisted');
    expect(res2.cached).toBe(true);
    expect(res2.data.value).toBe(42);
    expect(mockFetch2).not.toHaveBeenCalled();
  });

  it('different tenant requests do not share cached responses', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const tenant = req.headers.get('x-tenant-id');
      return Promise.resolve(
        new Response(JSON.stringify({ tenant, secret: `data-for-${tenant}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      cache: { enabled: true, ttl: 60000 },
    });

    const resA = await client.get<{ tenant: string; secret: string }>('/tenant-data', {
      headers: { 'x-tenant-id': 'org-alpha' },
    });
    expect(resA.data.secret).toBe('data-for-org-alpha');
    expect(resA.cached).toBeFalsy();

    const resB = await client.get<{ tenant: string; secret: string }>('/tenant-data', {
      headers: { 'x-tenant-id': 'org-beta' },
    });
    expect(resB.data.secret).toBe('data-for-org-beta');
    expect(resB.cached).toBeFalsy();

    // Verify subsequent call for org-alpha hits org-alpha cache
    const resA2 = await client.get<{ tenant: string; secret: string }>('/tenant-data', {
      headers: { 'x-tenant-id': 'org-alpha' },
    });
    expect(resA2.cached).toBe(true);
    expect(resA2.data.secret).toBe('data-for-org-alpha');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('expired cache entry is not treated as fresh data', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ version: callCount }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      cache: { enabled: true, ttl: 20 },
    });

    const res1 = await client.get<{ version: number }>('/short-lived');
    expect(res1.data.version).toBe(1);
    expect(res1.cached).toBeFalsy();

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 35));

    const res2 = await client.get<{ version: number }>('/short-lived');
    expect(res2.data.version).toBe(2);
    expect(res2.cached).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('mutation request invalidates cached data for the same path', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      callCount++;
      if (req.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ count: callCount }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      cache: { enabled: true, ttl: 60000 },
    });

    const get1 = await client.get<{ count: number }>('/items');
    expect(get1.data.count).toBe(1);

    // Second GET hits cache
    const getCached = await client.get<{ count: number }>('/items');
    expect(getCached.cached).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Mutation POST invalidates /items
    await client.post('/items', { name: 'new-item' });

    // Next GET must miss cache and fetch fresh
    const getFresh = await client.get<{ count: number }>('/items');
    expect(getFresh.cached).toBeFalsy();
    expect(getFresh.data.count).toBe(3);
  });

  it('storage failure does not crash normal network requests', async () => {
    const faultyStorage: CacheStorageAdapter = {
      getItem: vi.fn().mockRejectedValue(new Error('Storage disk corruption')),
      setItem: vi.fn().mockRejectedValue(new Error('Storage write failure')),
      removeItem: vi.fn().mockRejectedValue(new Error('Storage remove failure')),
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      cache: { enabled: true, storage: faultyStorage, ttl: 60000 },
    });

    // Should complete cleanly despite storage errors
    const res = await client.get<{ ok: boolean }>('/safe-failure');
    expect(res.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
