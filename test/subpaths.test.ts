import { describe, it, expect } from 'vitest';
import { createMockAdapter } from 'react-native-fetch-client/mock';
import { createOfflineQueue, MemoryStorageAdapter } from 'react-native-fetch-client/offline';
import { createClient } from 'react-native-fetch-client';

describe('Package Subpath Exports', () => {
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
