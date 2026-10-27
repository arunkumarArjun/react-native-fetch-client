/**
 * 03 - React Native & Expo Mobile Resilience
 *
 * Demonstrates:
 * 1. Persistent caching with MMKV or AsyncStorage
 * 2. Stale-While-Revalidate (SWR) for instant 0ms screen loads
 * 3. Offline mutation queue with Idempotency-Key and NetInfo background replay
 * 4. Unit mock adapter for zero-dependency testing
 */

import { createClient, type CacheStorageAdapter } from 'react-native-fetch-client';
import { createOfflineQueue, type OfflineStorageAdapter } from 'react-native-fetch-client/offline';
import { createMockAdapter } from 'react-native-fetch-client/mock';

// --- 1. Pluggable Storage Adapter for React Native (MMKV / AsyncStorage) ---
// Example MMKV Adapter:
// import { MMKV } from 'react-native-mmkv';
// const storage = new MMKV();
// export const mmkvAdapter: CacheStorageAdapter & OfflineStorageAdapter = {
//   getItem: (key) => storage.getString(key) ?? null,
//   setItem: (key, val) => storage.set(key, val),
//   removeItem: (key) => storage.delete(key),
// };

// In-memory fallback for TypeScript demonstration:
const memoryStorage = new Map<string, string>();
const storageAdapter: CacheStorageAdapter & OfflineStorageAdapter = {
  getItem: async (key) => memoryStorage.get(key) ?? null,
  setItem: async (key, val) => {
    memoryStorage.set(key, val);
  },
  removeItem: async (key) => {
    memoryStorage.delete(key);
  },
};

// --- 2. Configure Client with SWR & In-Flight Deduplication ---
export const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  dedupe: true, // Coalesce identical concurrent GETs
  cache: {
    maxAge: 300000, // 5 minutes
    strategy: 'stale-while-revalidate', // 0ms instant display + background revalidation
    storage: storageAdapter,
  },
});

// --- 3. Offline Mutation Queue with Idempotency ---
export const offlineQueue = createOfflineQueue({
  client: api,
  storage: storageAdapter,
  idempotencyHeader: 'Idempotency-Key',
  onReplaySuccess: (item) => {
    console.log(`[OfflineQueue] Successfully replayed ${item.method} ${item.url}`);
  },
});

// Trigger mutations when network is offline:
export async function queueLikePost(postId: string) {
  await offlineQueue.enqueue({
    url: `/posts/${postId}/like`,
    method: 'POST',
    body: { timestamp: Date.now() },
  });
  console.log('Action queued offline! Will replay automatically when reconnected.');
}

// In React Native Expo, wire to NetInfo:
// NetInfo.addEventListener((state) => {
//   if (state.isConnected && state.isInternetReachable) {
//     offlineQueue.process();
//   }
// });

// --- 4. Declarative Unit Mocking (For Vitest / Jest) ---
export function setupTestMocks() {
  const mock = createMockAdapter(api);

  mock.onGet('/user/profile').reply(200, {
    id: 'usr_100',
    name: 'Jane Doe',
    role: 'Admin',
  });

  mock.onPost('/posts/p1/like').reply(200, {
    liked: true,
  });

  return mock;
}
