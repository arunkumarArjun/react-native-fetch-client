import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { MemoryStorageAdapter } from '../src/offline/storage.js';

describe('Persistent Cache Storage (MMKV / AsyncStorage integration)', () => {
  it('persists and hydrates cached responses across client instances', async () => {
    const sharedStorage = new MemoryStorageAdapter();
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      return Promise.resolve(
        new Response(JSON.stringify({ greeting: 'hello persistent world', url: req.url }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    // Client 1: Fetches and persists to storage
    const client1 = createClient({
      fetchImpl: mockFetch,
      cache: {
        enabled: true,
        defaultTtl: 30000,
        storage: sharedStorage,
        storageKey: 'test_persist_cache',
      },
    });

    const res1 = await client1.get<{ greeting: string }>('http://api.local/greet');
    expect(res1.data.greeting).toBe('hello persistent world');
    expect(res1.cached).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify raw storage received data
    const rawStored = sharedStorage.getItem('test_persist_cache');
    expect(rawStored).toBeTruthy();
    expect(rawStored).toContain('hello persistent world');

    // Client 2: Simulates app restart with the same persistent storage
    const client2 = createClient({
      fetchImpl: mockFetch,
      cache: {
        enabled: true,
        defaultTtl: 30000,
        storage: sharedStorage,
        storageKey: 'test_persist_cache',
      },
    });

    // Wait for async hydrate
    await client2.cache.hydrate?.();

    // Client 2 request should be served immediately from hydrated persistent cache
    const res2 = await client2.get<{ greeting: string }>('http://api.local/greet');
    expect(res2.cached).toBe(true);
    expect(res2.data.greeting).toBe('hello persistent world');
    expect(mockFetch).toHaveBeenCalledTimes(1); // 0 additional network calls!
  });

  it('clears persistent storage when client.cache.clear() is called', async () => {
    const sharedStorage = new MemoryStorageAdapter();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ test: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = createClient({
      fetchImpl: mockFetch,
      cache: {
        enabled: true,
        storage: sharedStorage,
        storageKey: 'clear_test_cache',
      },
    });

    await client.get('http://api.local/test');
    expect(sharedStorage.getItem('clear_test_cache')).toBeTruthy();

    client.cache.clear();
    expect(sharedStorage.getItem('clear_test_cache')).toBeNull();
  });
});
