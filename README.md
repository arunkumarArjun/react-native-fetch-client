# react-native-fetch-client

A lightweight, Fetch-native HTTP client for TypeScript and JavaScript across React Native, Expo, web browsers, and Node.js.

[![npm version](https://img.shields.io/npm/v/react-native-fetch-client.svg)](https://www.npmjs.com/package/react-native-fetch-client)
[![Bundle Size](https://img.shields.io/badge/bundle%20size-12.8%20KB%20min%2Bgzip-brightgreen.svg)](https://bundlephobia.com/package/react-native-fetch-client)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-299%20passed-brightgreen.svg)](test)
[![Documentation](https://img.shields.io/badge/docs-interactive%20site-blue.svg)](https://react-native-fetch-client.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> 🚀 **[Explore the Interactive Documentation Website & Guides ➔](https://react-native-fetch-client.vercel.app/)**

### Why react-native-fetch-client over Axios?

| Feature | `react-native-fetch-client` | Axios |
| :--- | :--- | :--- |
| **Runtime Dependencies** | **0** (`dependencies: {}`) | 4 dependencies (`proxy-agent`, `redirects`, etc.) |
| **Minified Core Bundle** | **38.5 KB** (~12.8 KB gzip) | ~75 KB |
| **Mobile Network Engine**| Native WHATWG `fetch` (Hermes C++ JNI) | Legacy `XMLHttpRequest` (XHR bridge) |
| **401 Token Refresh**   | **Built-in Atomic Mutex** (zero race conditions) | Manual race-prone interceptor boilerplate |
| **Caching & Deduplication** | **Built-in SWR Cache (0ms)** & In-Flight Dedup | Requires 3rd-party plugins |

---

## Design Principles

1. **Standards-Based & Zero Dependencies**: Built directly on modern WHATWG specifications (`fetch`, `ReadableStream`, `AbortController`). The package has zero production dependencies (`dependencies: {}`), eliminating supply-chain vulnerabilities and keeping client bundles compact.
2. **First-Class Mobile Resilience**: Concurrency throttling, in-flight request deduplication, and auth token refresh mutexes are native architectural primitives, not loosely coupled third-party add-ons.
3. **Familiar Mental Model**: Follows standard HTTP client conventions (`.get()`, `.post()`, `.put()`, `.delete()`, `.interceptors`), ensuring zero learning curve for developers accustomed to Axios or Fetch.

---

## Standard Client Parity (Familiar Ergonomics)

If you have used Axios or standard HTTP clients, `react-native-fetch-client` provides the exact same mental model:

- **Instance Methods**: `api.get()`, `api.post()`, `api.put()`, `api.patch()`, `api.delete()`, `api.head()`, `api.options()`, and `api.request()`.
- **Default Client Instance**: Ready-to-use default import (`import client from 'react-native-fetch-client'`).
- **Configurable Defaults**: `baseURL` (and `baseUrl`), `timeout`, default `headers`, and `params`.
- **Interceptors**: Synchronous and asynchronous request and response interceptors with `.use()` and `.eject()`.
- **Response Format**: Predictable envelope with `response.data`, `response.status`, `response.headers`, and `response.config`.
- **Error Handling**: Standard HTTP status error propagation with `isHttpError` and `isNetworkError` type guards.
- **Request Cancellation**: Native WHATWG `AbortController` and `AbortSignal` integration.

---

## Universal Compatibility (Zero Native Dependencies)

Because `react-native-fetch-client` is built directly on standard WHATWG Web APIs with dual ESM (`.mjs`) and CommonJS (`.cjs`) outputs, it runs natively across all modern JavaScript runtimes with **zero native linking (`pod install`)**:

| Environment          | Supported Platforms & Versions                                 | Architecture Notes                                                                 |
| :------------------- | :------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **React Native**     | iOS, Android, macOS, Windows (v0.70 - v0.88+)                  | Native Hermes C++ bindings, JSC, Bridgeless & New Architecture ready               |
| **Expo**             | Managed workflows, Expo Go, EAS (SDK 50, 51, 52+)              | Pure JavaScript / Web API — zero native modules or config plugins required         |
| **Web Browsers**     | Chrome, Safari, Firefox, Edge, Mobile Safari/Chrome            | Evergreen browser compatibility via native WHATWG `fetch`                          |
| **Full-Stack & SSR** | Next.js (App Router, Server Components), Remix, Astro          | Dual ESM/CJS bundles with zero browser/DOM runtime assumptions                     |
| **Server & Edge**    | Node.js (>=18.0.0), Cloudflare Workers, Vercel Edge, Bun, Deno | Standard web specification compliance guarantees edge and serverless compatibility |
| **Desktop**          | Electron, Tauri                                                | Operates identically in renderer windows and main background processes             |

---

## Built-in Capabilities (Out of the Box)

In traditional HTTP setups, achieving production resilience requires installing, maintaining, and stitching together 5 to 7 separate packages. `react-native-fetch-client` provides these capabilities natively in a modular, zero-dependency package:

| Capability                                 | What It Solves                                                                                                                                                                               |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-Flight 401 Auth Mutex**           | Queues concurrent requests behind an asynchronous lock when access tokens expire. Exactly 1 refresh call executes; pending requests replay automatically with the new token.                 |
| **In-Flight Request Deduplication**        | Coalesces identical concurrent `GET` requests into a single network flight, eliminating duplicate requests when multiple UI components mount simultaneously.                                 |
| **Async Webhook & Resource Waiter**        | Dedicated `api.waitFor()` method for polling payment settlement (3DS, Apple Pay, UPI), KYC verification, or background jobs with error suppression, backoff caps, and abort criteria.        |
| **Response Caching & SWR**                 | Dual-tier caching: in-memory LRU, persistent storage adapters (MMKV / AsyncStorage), RFC 7234 conditional validation (ETag / 304), and Stale-While-Revalidate (SWR) background revalidation. |
| **Automatic Cache Invalidation**           | Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) automatically purge matching cached paths, with support for declarative route and RegExp pattern invalidation.                                  |
| **Resilient Retry Engine**                 | Configurable exponential backoff retries with full jitter, server `Retry-After` adherence, and custom retry predicates.                                                                      |
| **Client Concurrency Throttling**          | FIFO queue caps maximum simultaneous active sockets (`maxConcurrentRequests`) to prevent mobile connection bottlenecks.                                                                      |
| **Search Autocomplete Auto-Cancel**        | `cancelPrevious: '<groupKey>'` automatically aborts superseded search queries as the user types, preventing out-of-order race conditions.                                                    |
| **Native AI & SSE Streaming**              | Consume Server-Sent Events (SSE) and AI LLM token streams (OpenAI, Anthropic, Gemini, Ollama) directly via async generators (`api.stream`).                                                  |
| **Go/Rust-Style Safe Requests**            | `api.safe.*` returns typed `[data, error]` tuples, eliminating nested `try/catch` boilerplate.                                                                                               |
| **Standard Schema v1 Validation**          | Built-in runtime response validation supporting Zod, Valibot, ArkType, and functional schemas with compile-time type inference.                                                              |
| **Auto-Pagination Helper**                 | Traversing paginated endpoints (`api.paginate`) across page-number, offset-limit, cursor-based, and RFC 5988/8288 `Link` header APIs.                                                        |
| **Declarative Mock Adapter (`.../mock`)**  | Modular testing adapter (`react-native-fetch-client/mock`) for unit testing network logic, stubbing routes, and asserting call history with 0 KB production bundle impact.                   |
| **Offline Mutation Queue (`.../offline`)** | Modular offline queue (`react-native-fetch-client/offline`) that replays requests sequentially with persistent UUID idempotency headers upon reconnection.                                   |

---

## How It Compares

| Feature                                    |       `react-native-fetch-client`        |                   `axios`                   |                  `ky`                  |
| :----------------------------------------- | :--------------------------------------: | :-----------------------------------------: | :------------------------------------: |
| **Engine Foundation**                      |          Native WHATWG `fetch`           | Legacy `XMLHttpRequest` (default) / Adapter |             WHATWG `fetch`             |
| **Runtime Dependencies**                   |        **0 (`dependencies: {}`)**        |     Multiple (`follow-redirects`, etc.)     |                 **0**                  |
| **Native Mobile Linking (`pod install`)**  |       **None** (Pure JS / Web API)       |            None (via XHR bridge)            |            None (Web-first)            |
| **Documented React Native & Expo Support** | **First-Class** (Hermes C++, Bridgeless) |               Yes (XHR-based)               |        Community / undocumented        |
| **Response Body Handling**                 |    **Auto-parsed (`response.data`)**     |        Auto-parsed (`response.data`)        | Chained methods (`.json()`, `.text()`) |
| **Automatic Retries & Backoff**            |   **Built-in** (Exponential + Jitter)    |           Plugin (`axios-retry`)            |    Built-in (Exponential + Jitter)     |
| **In-Flight Request Deduplication**        |      **Built-in** (`GET` / `HEAD`)       |               Plugin / Manual               |              Not built-in              |
| **Single-Flight 401 Auth Mutex**           |      **Built-in** (Queue + Replay)       |          Custom interceptor logic           |     Custom hooks (`afterResponse`)     |
| **Dual-Tier Cache & SWR**                  | **Built-in** (Memory LRU + MMKV/Storage) |     Plugin (`axios-cache-interceptor`)      |              Not built-in              |
| **Offline Mutation Replay Queue**          |       **Built-in** (`.../offline`)       |                Not built-in                 |              Not built-in              |
| **Declarative Unit Mock Adapter**          |        **Built-in** (`.../mock`)         |        Plugin (`axios-mock-adapter`)        |           Third-party (MSW)            |
| **Runtime Schema Validation**              |    **Built-in** (Standard Schema v1)     |                Not built-in                 |       Built-in (`.json(schema)`)       |
| **Safe Requests (`[data, error]`)**        |       **Built-in** (`api.safe.*`)        |                Not built-in                 |              Not built-in              |
| **Search Auto-Cancel (`cancelPrevious`)**  |               **Built-in**               |         Manual (`AbortController`)          |       Manual (`AbortController`)       |
| **Async Webhook / Job Waiter**             |       **Built-in** (`api.waitFor`)       |                Not built-in                 |              Not built-in              |
| **SSE & AI Token Streaming**               |       **Built-in** (`api.stream`)        |        Node-only / Complex on mobile        |       Built-in (ReadableStream)        |

### Key Advantages over Ky

While [Ky](https://github.com/sindresorhus/ky) is a popular Fetch wrapper, it is designed primarily as a lightweight utility for web browsers and server scripts. In contrast, `react-native-fetch-client` provides full cross-platform resilience across **React Native, Expo, Web, and Node.js** with zero dependencies:

1. **Single-Flight 401 Refresh Mutex**: When an access token expires, multiple components mounting simultaneously (e.g., profile, feed, notification badges) receive 401 responses. Ky triggers uncoordinated `afterResponse` hooks, firing duplicate refresh requests that cause OAuth token-reuse rejection. `react-native-fetch-client` locks atomically, executes **one** refresh mutation, and replays all queued requests with the fresh token.
2. **In-Flight Request Deduplication**: Duplicate component trees or rapid user navigation shouldn't spawn redundant network requests. `react-native-fetch-client` coalesces identical in-flight `GET` requests into a single network socket, preserving bandwidth and mobile battery.
3. **Offline Mutation Queue (`.../offline`)**: Mobile networks frequently drop in elevators and subways. `react-native-fetch-client/offline` safely stores failed mutations in persistent storage (MMKV or AsyncStorage) and automatically replays them in order with `Idempotency-Key` headers upon NetInfo reconnection.
4. **Persistent Dual-Tier Caching & SWR**: Browser HTTP caching does not persist across app restarts in React Native. `react-native-fetch-client` provides instant 0ms Stale-While-Revalidate (SWR) caching with pluggable MMKV/AsyncStorage storage.
5. **Ergonomics & Safe Requests**: `react-native-fetch-client` auto-parses responses into `response.data` (matching standard HTTP client conventions), and offers `api.safe.*` for Go/Rust-style `[data, error]` tuples, eliminating nested `try/catch` boilerplate.

---

## When Not to Use It

Be honest about engineering trade-offs before adopting any library:

1. **You only need simple, sporadic requests**: If your app makes only 2–3 unauthenticated GET calls, the global `fetch()` built into React Native and browsers is completely sufficient without any wrapper.
2. **You require continuous upload byte progress bars in React Native**: Because this library is built on WHATWG `fetch` rather than legacy `XMLHttpRequest`, continuous intermediate byte progress (0% → 25% → 75% → 100%) during file upload is not supported by standard mobile fetch engines. For multi-gigabyte video or asset uploads requiring progress bars, use `expo-file-system` or `react-native-blob-util`.
3. **You already use TanStack Query for full client-state management**: TanStack Query already provides in-memory caching, retry policies, and deduplication. While `react-native-fetch-client` pairs exceptionally well with TanStack Query as a transport client (especially for its 401 auth mutex and baseURL defaults), you should disable this library's cache layer (`cache: false`) to avoid double-caching in memory.
4. **You require legacy Node.js (<18.0) or older runtimes without Fetch**: If you run on Node.js 14/16 without a polyfill, standard WHATWG `fetch` is unavailable.

---

## Installation

```bash
npm install react-native-fetch-client
```

Or using another package manager:

```bash
yarn add react-native-fetch-client
pnpm add react-native-fetch-client
bun add react-native-fetch-client
```

### Optional Peer Dependencies

All core capabilities require **zero** dependencies. If you opt into specific plugins or storage integrations, install the corresponding peer package:

```bash
# Persistent Cache & Offline Queue storage adapters (choose one for React Native)
npm install react-native-mmkv
# or: npm install @react-native-async-storage/async-storage

# Response Schema Validation (choose your preferred validator)
npm install zod
# or: npm install valibot / arktype

# Node.js Corporate HTTP/HTTPS Proxies (Node.js runtimes only)
npm install undici
```

---

## Quick Start

### TypeScript

```typescript
import { createClient } from 'react-native-fetch-client';

interface User {
  id: number;
  name: string;
  email: string;
}

const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10_000,
});

// Strongly typed GET request
const response = await api.get<User[]>('/users');
console.log(response.status); // 200
console.log(response.data); // User[]

// Strongly typed POST request
const created = await api.post<User>('/users', {
  name: 'Jane Doe',
  email: 'jane@example.com',
});
console.log(created.data.id);
```

### Pre-configured Default Instance

For quick scripts or lightweight usage, import the pre-configured default client:

```typescript
import client from 'react-native-fetch-client';

const response = await client.get('https://api.example.com/health');
console.log(response.data);

// Create child clients directly:
const api = client.create({ baseURL: 'https://api.example.com' });
```

### JavaScript (ES Modules)

```javascript
import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

const res = await api.get('/users');
console.log(res.data);
```

### JavaScript (CommonJS & ESM) & TypeScript Interop

`react-native-fetch-client` is published as a dual ESM/CommonJS package with complete type declarations for both module systems and subpaths.

**CommonJS (`require`):**

```javascript
// Root package
const { createClient, isHttpError } = require('react-native-fetch-client');

// Subpath packages
const { createOfflineQueue } = require('react-native-fetch-client/offline');
const { createMockAdapter } = require('react-native-fetch-client/mock');

const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

async function run() {
  try {
    const res = await api.get('/users');
    console.log(res.data);
  } catch (err) {
    if (isHttpError(err)) {
      console.error('HTTP Error:', err.status, err.data);
    }
  }
}

run();
```

**TypeScript Configuration (`tsconfig.json`):**
For modern React Native, Expo (SDK 50+), Vite, and Next.js, ensure `"moduleResolution"` is set to `"bundler"` or `"node16"` / `"nodenext"`:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

> [!NOTE]
> For legacy TypeScript configurations using `"moduleResolution": "node"`, `typesVersions` is pre-configured in `package.json` so subpaths (`/offline`, `/mock`) resolve type declarations automatically without requiring manual `paths` mappings.

---

## Common Production Recipes

### 1. Modern React Native Setup (SecureStore + MMKV + Refresh Mutex)

```typescript
import { createClient } from 'react-native-fetch-client';
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'app-http-cache' });

export const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10000,
  auth: {
    getToken: async () => await SecureStore.getItemAsync('access_token'),
    refreshToken: async () => {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      const res = await fetch('https://api.example.com/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) throw new Error('Session expired');
      const { accessToken, newRefreshToken } = await res.json();
      await SecureStore.setItemAsync('access_token', accessToken);
      await SecureStore.setItemAsync('refresh_token', newRefreshToken);
      return accessToken;
    },
    refreshOn: [401],
    refreshExcludeUrls: ['/auth/login', '/auth/refresh'],
  },
  cache: {
    enabled: true,
    storage: {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, val) => storage.set(key, val),
      removeItem: (key) => storage.delete(key),
    },
    defaultTtl: 300_000, // 5 minutes
  },
});
```

### 2. TanStack Query (React Query) Integration

`react-native-fetch-client` is an ideal transport client for TanStack Query. While TanStack Query orchestrates cache lifecycle, background refetching, and component state, `react-native-fetch-client` handles the network-level heavy lifting:

- Centralized `baseURL`, timeouts, and default headers.
- **Single-Flight 401 Refresh Mutex**: When multiple queries mount simultaneously and fail with 401, the client coordinates a single token refresh and transparently replays all in-flight queries—preventing token refresh storms.
- Request cancellation forwarding via TanStack Query's `signal`.

> [!TIP]
> Disable client caching (`cache: false` or omit `cache`) on transport clients paired with TanStack Query to prevent redundant duplicate caching in memory.

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from 'react-native-fetch-client';

// 1. Configure transport client (cache: false delegates caching to TanStack Query)
export const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10000,
  cache: false,
  auth: {
    getToken: async () => await getSecureToken(),
    refreshToken: async () => await refreshSession(),
  },
});

interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// 2. Fetch Query: unwrap payload & forward cancellation signal
export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ['users', userId],
    queryFn: ({ signal }) => api.get<UserProfile>(`/users/${userId}`, { unwrap: true, signal }),
  });
}

// 3. Mutation: patch resource and invalidate cache
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (user: Partial<UserProfile> & { id: string }) =>
      api.patch<UserProfile>(`/users/${user.id}`, user, { unwrap: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(['users', data.id], data);
    },
  });
}
```

### 3. Payment Verification & Webhook Polling (`api.waitFor`)

Poll for asynchronous event settlement (3DS verification, Stripe webhooks, Apple Pay, UPI):

```typescript
import { isWaitForAbortedError } from 'react-native-fetch-client';
import { api } from './api';

try {
  const order = await api.waitFor<Order>('/orders/ord-992/status', {
    until: (res) => res.data.status === 'succeeded',
    stopIf: (res) => res.data.status === 'failed', // Aborts immediately without waiting for timeout
    ignoreErrors: [404], // Tolerates 404 while backend webhook writes record
    interval: 1000,
    backoff: 1.5,
    maxInterval: 5000, // Backoff ceiling cap
    timeout: 45000, // Total timeout deadline
    requestConfig: {
      cache: false, // 🛑 Ensures financial status checks never serve stale SWR data
      dedup: false, // 🛑 Ensures every poll attempt reaches the live server
    },
    onTick: ({ attempt, elapsedMs }) => {
      console.log(`Checking payment (attempt ${attempt}, ${Math.round(elapsedMs / 1000)}s)...`);
    },
  });
  console.log('Payment verified:', order.data.receiptUrl);
} catch (err) {
  if (isWaitForAbortedError(err)) {
    console.error('Payment failed immediately:', err.response.data);
  }
}
```

### 4. Search Bar with Instant Cancellation (`cancelPrevious`)

Eliminate race conditions where slower earlier queries overwrite newer search results:

```typescript
const searchUsers = async (queryText: string) => {
  try {
    const res = await api.get('/users/search', {
      params: { q: queryText },
      cancelPrevious: 'user-search', // Automatically aborts prior in-flight search queries
    });
    return res.data;
  } catch (err) {
    if (isCancelError(err)) return null; // Safely ignore superseded queries
    throw err;
  }
};
```

### 5. AI LLM Token Streaming (`api.stream`)

Consume Server-Sent Events (SSE) token by token from OpenAI, Anthropic, Gemini, or local models:

```typescript
const eventStream = api.stream('/chat/completions', {
  method: 'POST',
  body: {
    model: 'gpt-4o',
    stream: true,
    messages: [{ role: 'user', content: 'Explain quantum computing in 3 bullets' }],
  },
});

for await (const chunk of eventStream) {
  if (chunk.data === '[DONE]') break;
  try {
    const parsed = JSON.parse(chunk.data);
    const token = parsed.choices[0]?.delta?.content ?? '';
    process.stdout.write(token);
  } catch {
    // Non-JSON event
  }
}
```

### 6. File Upload with Progress Bar (`api.upload`)

```typescript
const res = await api.upload('/media/upload', fileBlob, {
  fieldName: 'file',
  fileName: 'photo.jpg',
  extraFields: { folderId: 'inbox' },
  onUploadProgress: (progress) => {
    if (progress.progress !== undefined) {
      const percent = Math.round(progress.progress * 100);
      console.log(`Upload: ${percent}% (${progress.loaded} / ${progress.total} bytes)`);
    }
  },
});
```

### 7. Declarative Mock Adapter (`react-native-fetch-client/mock`)

Unit-test API calls and integration flows with zero external dependencies (no MSW or Axios-mock required). Isolated to the `/mock` subpath for 0 KB production app bundle overhead:

```typescript
import { createClient } from 'react-native-fetch-client';
import { createMockAdapter } from 'react-native-fetch-client/mock';

const api = createClient();
const mock = createMockAdapter(api);

mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice' });

const res = await api.get('/users/1');
console.log(res.data); // { id: 1, name: 'Alice' }
```

### 8. Offline Mutation Queue (`react-native-fetch-client/offline`)

Queue mutations when the device is disconnected and automatically replay them sequentially with idempotent UUID headers when connection restores:

```typescript
import { createClient } from 'react-native-fetch-client';
import { createOfflineQueue, MemoryStorageAdapter } from 'react-native-fetch-client/offline';
import NetInfo from '@react-native-community/netinfo';

const api = createClient({ baseURL: 'https://api.example.com' });
const queue = createOfflineQueue({
  client: api,
  storage: new MemoryStorageAdapter(), // Or MMKV / AsyncStorage adapter
  onReplaySuccess: (item) => console.log(`Replayed ${item.method} ${item.url}`),
  onPermanentFailure: (item, err) => console.error(`Failed ${item.url}:`, err),
});

// Automatically trigger replay when device regains internet connectivity
NetInfo.addEventListener((state) => {
  if (state.isConnected && state.isInternetReachable) {
    queue.process();
  }
});

// Enqueue mutation safely while offline (receives an automatic Idempotency-Key)
await queue.enqueue({
  method: 'POST',
  url: '/sync/actions',
  body: { action: 'like', targetId: 'post-992' },
});
```

---

## Detailed Documentation Guides

For in-depth explanations of individual features, see the dedicated guides in the [`docs/`](./docs) folder:

- [Architecture and Execution Flow](./docs/architecture-flow.md)
- [Core Features and Usage Guide](./docs/core-features-guide.md)
- [Caching and Stale-While-Revalidate](./docs/caching-and-swr.md)
- [Resilience, Retries, and Offline Queue](./docs/resilience-and-offline.md)
- [Streaming, AI, and File Uploads](./docs/streaming-and-uploads.md)
- [Authentication and Security](./docs/auth-and-security.md)
- [Auto-Pagination Helper](./docs/auto-pagination.md)
- [Testing and Mock Adapter](./docs/testing-and-mocking.md)

---

## Configuration Reference

### ClientConfig

Options passed to `createClient(config)`:

| Option                  | Type                                          | Default            | Description                                                                           |
| :---------------------- | :-------------------------------------------- | :----------------- | :------------------------------------------------------------------------------------ |
| `baseURL` / `baseUrl`   | `string`                                      | `undefined`        | Base URL prepended to relative request URLs.                                          |
| `headers`               | `HeadersInit`                                 | `undefined`        | Default HTTP headers included with all requests.                                      |
| `params`                | `QueryParams`                                 | `undefined`        | Default query parameters merged into all requests.                                    |
| `timeout`               | `number`                                      | `0`                | Default timeout in milliseconds (0 = no timeout).                                     |
| `responseType`          | `ResponseType`                                | `'json'`           | Default response parsing (`'json'`, `'text'`, `'blob'`, `'arrayBuffer'`, `'stream'`). |
| `credentials`           | `RequestCredentials`                          | `undefined`        | Credentials mode (`'omit'`, `'same-origin'`, `'include'`).                            |
| `redirect`              | `RequestRedirect`                             | `undefined`        | Redirect handling (`'follow'`, `'manual'`, `'error'`).                                |
| `bearerToken`           | `string \| (() => string \| Promise<string>)` | `undefined`        | Static token or dynamic getter for `Authorization: Bearer <token>`.                   |
| `auth`                  | `AuthConfig`                                  | `undefined`        | Token refresh mutex and authentication configuration.                                 |
| `cache`                 | `CacheConfig \| boolean`                      | `undefined`        | Caching configuration (LRU, TTL, SWR, storage adapter).                               |
| `dedup`                 | `DedupConfig \| boolean`                      | `undefined`        | In-flight request deduplication configuration.                                        |
| `retry`                 | `Partial<RetryPolicy> \| false`               | `undefined`        | Retry engine configuration (attempts, backoff, jitter, status codes).                 |
| `maxConcurrentRequests` | `number`                                      | `0`                | Maximum simultaneous active requests (0 = unlimited).                                 |
| `unwrap`                | `boolean`                                     | `false`            | When true, returns `response.data` directly instead of `HttpResponse<T>`.             |
| `debug`                 | `boolean \| DebugLogger`                      | `false`            | Enable console debug logging or provide a custom logger callback.                     |
| `fetchImpl`             | `FetchImpl`                                   | `globalThis.fetch` | Custom Fetch transport implementation.                                                |
| `dispatcher`            | `unknown`                                     | `undefined`        | Custom dispatcher (e.g. Undici ProxyAgent in Node.js).                                |

### RequestConfig

Options passed to individual request calls (overrides client defaults):

| Option               | Type                             | Default     | Description                                                                     |
| :------------------- | :------------------------------- | :---------- | :------------------------------------------------------------------------------ |
| `url`                | `string`                         | `''`        | Request path or absolute URL.                                                   |
| `method`             | `HttpMethod`                     | `'GET'`     | HTTP method.                                                                    |
| `headers`            | `HeadersInit`                    | `undefined` | Request-specific HTTP headers.                                                  |
| `params`             | `QueryParams`                    | `undefined` | Query parameters serialized onto the URL.                                       |
| `pathParams`         | `PathParams`                     | `undefined` | Path parameter interpolation mapping (e.g. `{ id: 42 }`).                       |
| `body`               | `unknown`                        | `undefined` | Request body payload. Objects are serialized to JSON by default.                |
| `timeout`            | `number`                         | Inherited   | Request timeout in milliseconds.                                                |
| `signal`             | `AbortSignal`                    | `undefined` | WHATWG AbortSignal for request cancellation.                                    |
| `cancelPrevious`     | `string`                         | `undefined` | Cancellation group key. Aborts prior in-flight requests sharing the key.        |
| `schema`             | `SchemaValidator<T>`             | `undefined` | Standard Schema v1 validator (Zod, Valibot, ArkType) for response verification. |
| `formUrlEncoded`     | `boolean`                        | `false`     | Serializes body as `application/x-www-form-urlencoded`.                         |
| `cache`              | `RequestCacheConfig \| boolean`  | Inherited   | Per-request cache configuration, invalidation targets, or SWR callbacks.        |
| `dedup`              | `boolean`                        | Inherited   | Enable or disable in-flight deduplication for this request.                     |
| `retry`              | `Partial<RetryPolicy> \| false`  | Inherited   | Per-request retry policy override.                                              |
| `unwrap`             | `boolean`                        | Inherited   | Override response unwrapping for this request.                                  |
| `onDownloadProgress` | `(event: ProgressEvent) => void` | `undefined` | Real-time download progress callback.                                           |
| `onUploadProgress`   | `(event: ProgressEvent) => void` | `undefined` | Real-time upload progress callback.                                             |

---

## Error Handling

All client errors inherit from `FetchNativeError` and include typed discriminators and type guard functions:

```typescript
import {
  isHttpError,
  isNetworkError,
  isTimeoutError,
  isCancelError,
  isValidationError,
  isWaitForAbortedError,
} from 'react-native-fetch-client';

try {
  await api.get('/profile');
} catch (err) {
  if (isHttpError(err)) {
    console.log(`HTTP ${err.status}:`, err.data);
  } else if (isTimeoutError(err)) {
    console.log(`Timeout: exceeded ${err.timeoutMs}ms`);
  } else if (isCancelError(err)) {
    console.log('Request was aborted');
  } else if (isNetworkError(err)) {
    console.log('Network failure or offline');
  } else if (isValidationError(err)) {
    console.log('Schema validation failed:', err.issues);
  } else if (isWaitForAbortedError(err)) {
    console.log('Wait was terminated by stopIf:', err.response.data);
  }
}
```

---

## Migrating from Axios

`react-native-fetch-client` follows standard HTTP client ergonomics, making migration from Axios seamless:

| Axios Syntax                                | `react-native-fetch-client` Syntax                                   | Notes                                    |
| :------------------------------------------ | :------------------------------------------------------------------- | :--------------------------------------- |
| `import axios from 'axios'`                 | `import client, { createClient } from 'react-native-fetch-client'`   | Ready-to-use default instance or factory |
| `axios.get(url, config)`                    | `client.get(url, config)`                                            | 1:1 syntax parity                        |
| `axios.post(url, data, config)`             | `client.post(url, data, config)`                                     | 1:1 syntax parity                        |
| `axios.delete(url, config)`                 | `client.delete(url, config)` _(or `client.del`)_                     | Same method with `.del()` shorthand      |
| `axios.create({ baseURL })`                 | `createClient({ baseURL })` _(or `client.create()`)_                 | Both `baseURL` and `baseUrl` supported   |
| `res.data`, `res.status`, `res.headers`     | `res.data`, `res.status`, `res.headers`                              | Exact response envelope shape            |
| `axios.interceptors.request.use(...)`       | `api.interceptors.request.use(...)`                                  | `.use()` and `.eject()` supported        |
| `axios.isAxiosError(err)`                   | `isHttpError(err)` or `isFetchNativeError(err)`                      | Type-safe error discriminator guards     |
| `axios-retry` (external plugin)             | `createClient({ retry: { attempts: 3 } })`                           | Native exponential backoff with jitter   |
| `axios-cache-interceptor` (external plugin) | `createClient({ cache: { enabled: true } })`                         | Native LRU, SWR & RFC 7234 validation    |
| `axios-mock-adapter` (external plugin)      | `import { createMockAdapter } from 'react-native-fetch-client/mock'` | Native declarative mock adapter          |
| Cancel token / `AbortController`            | Standard WHATWG `signal: controller.signal`                          | Standard WHATWG cancellation             |

#### Key Differences to Note:

- **Error Representation**: Instead of checking `error.response?.data`, catch errors using `isHttpError(err)` where `err.status` and `err.data` are strongly typed.
- **Request Body in Config**: When calling the generic `api.request({ ... })`, pass payload data as `body: data` (following Fetch standards) rather than `data: data`.
- **Subpaths for Testing & Offline**: Mock utilities and offline queues are imported from dedicated subpaths (`react-native-fetch-client/mock` and `react-native-fetch-client/offline`) to maintain a 0 KB overhead for production bundles.

---

## Changelog

For release history, migration notes, and version highlights, see [CHANGELOG.md](CHANGELOG.md).

## Security

For vulnerability disclosure and security guidance, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) &copy; 2026 Arunkumar Arjunan
