import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';

describe('Stale-While-Revalidate (SWR) Caching Strategy', () => {
  it('returns cached response immediately while fresh', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ value: `v${callCount}` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      fetchImpl: mockFetch,
      cache: {
        enabled: true,
        defaultTtl: 5000,
        strategy: 'stale-while-revalidate',
      },
    });

    const r1 = await client.get<{ value: string }>('http://api.local/data');
    expect(r1.data.value).toBe('v1');
    expect(r1.cached).toBe(false);

    const r2 = await client.get<{ value: string }>('http://api.local/data');
    expect(r2.data.value).toBe('v1');
    expect(r2.cached).toBe(true);
    expect(r2.stale).toBeFalsy();
    expect(callCount).toBe(1);
  });

  it('returns stale response immediately and updates in background when expired', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ count: callCount }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      fetchImpl: mockFetch,
      cache: {
        enabled: true,
        defaultTtl: 50, // 50ms TTL
        strategy: 'stale-while-revalidate',
      },
    });

    // Initial fetch -> count = 1
    const r1 = await client.get<{ count: number }>('http://api.local/counter');
    expect(r1.data.count).toBe(1);
    expect(r1.cached).toBe(false);

    // Wait 70ms for entry to expire
    await new Promise((resolve) => setTimeout(resolve, 70));

    // Second fetch in SWR mode: should return stale cached response immediately (count = 1) with stale: true
    let revalidatedData: { count: number } | null = null;
    const r2 = await client.get<{ count: number }>('http://api.local/counter', {
      cache: {
        strategy: 'stale-while-revalidate',
        onRevalidated: (freshRes) => {
          revalidatedData = freshRes.data as { count: number };
        },
      },
    });

    expect(r2.cached).toBe(true);
    expect(r2.stale).toBe(true);
    expect(r2.data.count).toBe(1);

    // Wait for background revalidation microtask to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callCount).toBe(2);
    expect(revalidatedData).toEqual({ count: 2 });

    // Third fetch should now return the fresh revalidated count (count = 2)
    const r3 = await client.get<{ count: number }>('http://api.local/counter');
    expect(r3.data.count).toBe(2);
    expect(r3.cached).toBe(true);
  });
});
