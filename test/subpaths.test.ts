import { describe, it, expect } from 'vitest';
import { createMockAdapter } from 'react-native-fetch-client/mock';
import { createOfflineQueue, MemoryStorageAdapter } from 'react-native-fetch-client/offline';
import {
  createClient,
  type CacheEntry,
  type SerializedCacheEntry,
} from 'react-native-fetch-client';

describe('Package Subpath Exports', () => {
  it('correctly re-exports cache types from main index', () => {
    type TestEntry = CacheEntry<{ hello: string }>;
    const entry: TestEntry | null = null;
    const serialized: SerializedCacheEntry = {
      data: { hello: 'world' },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      expiresAt: Date.now() + 60000,
    };
    expect(entry).toBeNull();
    expect(serialized.status).toBe(200);
    expect(serialized.headers['content-type']).toBe('application/json');
  });
  it('correctly resolves and initializes createMockAdapter from /mock', () => {
    const client = createClient();
    const mock = createMockAdapter(client);
    expect(mock).toBeDefined();
    expect(typeof mock.onGet).toBe('function');
  });

  it('correctly resolves and initializes createOfflineQueue from /offline', () => {
    const client = createClient();
    const storage = new MemoryStorageAdapter();
    const queue = createOfflineQueue({ client, storage });
    expect(queue).toBeDefined();
    expect(typeof queue.enqueue).toBe('function');
  });
});
