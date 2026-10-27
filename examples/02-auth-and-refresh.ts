/**
 * 02 - Authentication & Single-Flight 401 Refresh Mutex
 *
 * Demonstrates:
 * 1. Dynamic bearer token retrieval from secure storage
 * 2. Automatic 401 interception and single-flight token refresh mutex
 * 3. Transparent request replay with the newly acquired token
 */

import { createClient } from 'react-native-fetch-client';

// Simulated app session state
let currentAccessToken = 'expired-token';
let currentRefreshToken = 'valid-refresh-token';

async function getStoredToken(): Promise<string> {
  return currentAccessToken;
}

async function performTokenRefresh(): Promise<string> {
  console.log('[Auth] Refresh mutation initiated...');
  // Simulate network delay for token exchange endpoint
  await new Promise((r) => setTimeout(r, 200));

  // Update session
  currentAccessToken = `fresh-token-${Date.now()}`;
  console.log('[Auth] Token successfully refreshed!');
  return currentAccessToken;
}

const api = createClient({
  baseURL: 'https://api.example.com',
  // Option A: Simple dynamic token injection
  bearerToken: getStoredToken,

  // Option B: Full Single-Flight 401 Mutex coordination
  auth: {
    getToken: getStoredToken,
    refreshToken: performTokenRefresh,
    // URLs excluded from triggering 401 refresh (e.g. login or refresh endpoints)
    refreshExcludeUrls: ['/auth/login', '/auth/refresh'],
  },
});

async function main() {
  console.log('Dispatching 3 concurrent requests with an expired token...');

  // When multiple components mount simultaneously, all 3 receive 401 Unauthorized.
  // The client pauses calls 2 and 3 behind an atomic lock, calls refreshToken() ONCE,
  // and replays all 3 requests with the fresh token.
  try {
    const results = await Promise.all([
      api.get('/profile'),
      api.get('/notifications/unread'),
      api.get('/feature-flags'),
    ]);
    console.log(`All ${results.length} requests succeeded after single-flight refresh.`);
  } catch (err) {
    console.error('Request failed:', err);
  }
}

export { api, main };
