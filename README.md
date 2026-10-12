# react-native-fetch-client

> **A high-performance, Fetch-native HTTP client for TypeScript & JavaScript (React Native, Expo, modern browsers, and Node.js).**  
> Zero runtime dependencies • Dual ESM & CJS • In-flight Request Deduplication • Response Caching • Auth Mutex • Offline Queue • Streaming Progress

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript & JavaScript](https://img.shields.io/badge/Languages-TypeScript%20%7C%20JavaScript-blue)](https://www.typescriptlang.org/)
[![Runtime Dependencies](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Tests: 186 passing](https://img.shields.io/badge/Tests-186%20Passing-brightgreen.svg)](test)

---

## 📖 Developer Documentation Guides

For in-depth explanations, execution pipeline flows, and implementation guides, explore the dedicated documentation suite:

* 🏛️ **[Architecture & Execution Pipeline Flow](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/architecture-flow.md)** — Step-by-step trace through the 16-stage request pipeline.
* 🛠️ **[Core Features & Usage Guide](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/core-features-guide.md)** — Client setup, HTTP methods, path params, form encoding, safe requests, and unwrap.
* ⚡ **[Caching & Stale-While-Revalidate](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/caching-and-swr.md)** — In-memory LRU, persistent storage adapters (MMKV/AsyncStorage), ETag/304, and SWR.
* 🛡️ **[Resilience, Retries & Offline Queue](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/resilience-and-offline.md)** — Exponential backoff, jitter, circuit breakers, concurrency throttling, and offline replay.
* 🤖 **[Streaming, AI & File Uploads](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/streaming-and-uploads.md)** — SSE & AI LLM token streams, WHATWG streams, file uploads, and upload/download progress.
* 🔑 **[Authentication & Security](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/auth-and-security.md)** — Bearer presets, single-flight 401 refresh mutex, token rotation, and header redaction.
* 🔄 **[Auto-Pagination Helper](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/auto-pagination.md)** — Traversal strategies (`page`, `offset`, `cursor`, `linkHeader`) and async generator streaming.
* 🧪 **[Testing & Mock Adapter Guide](https://github.com/arunkumarArjun/react-native-fetch-client/blob/main/docs/testing-and-mocking.md)** — Declarative unit testing (`createMockAdapter`), route stubbing, and call assertions.

---

## Table of Contents

- [Why react-native-fetch-client?](#why-react-native-fetch-client)
- [Installation](#installation)
- [Developer Documentation Guides](#-developer-documentation-guides)
- [Quick Start (TypeScript & JavaScript)](#quick-start)
  - [TypeScript (ESM)](#1-typescript-esm)
  - [JavaScript (ES Modules - `import`)](#2-javascript-es-modules---import)
  - [JavaScript (CommonJS - `require`)](#3-javascript-commonjs---require)
- [HTTP Methods & Shorthands](#http-methods--shorthands)
- [Standard Schema Validation (`schema`)](#standard-schema-validation-schema)
- [Auto-Pagination Helper (`api.paginate`)](#auto-pagination-helper-apipaginate)
- [Native AI & SSE Streaming (`api.stream`)](#native-ai--sse-streaming-apistream)
- [Go/Rust-Style Safe Requests (`api.safe.*`)](#gorust-style-safe-requests-apisafe)
- [Client Concurrency Throttler (`maxConcurrentRequests`)](#client-concurrency-throttler-maxconcurrentrequests)
- [Circuit Breaker Pattern (`circuitBreaker`)](#circuit-breaker-pattern-circuitbreaker)
- [RFC 7234 Conditional Caching (`ETag` & `304 Not Modified`)](#rfc-7234-conditional-caching-etag--304-not-modified)
- [Persistent Storage Response Cache (`storage`)](#persistent-storage-response-cache-storage)
- [Stale-While-Revalidate (`strategy: 'stale-while-revalidate'`)](#stale-while-revalidate-strategy-stale-while-revalidate)
- [Declarative Testing Mock Adapter (`createMockAdapter`)](#declarative-testing-mock-adapter-createmockadapter)
- [Path Parameter Interpolation (`pathParams`)](#path-parameter-interpolation-pathparams)
- [Bearer Token Preset (`bearerToken`)](#bearer-token-preset-bearertoken)
- [File Upload Helper (`api.upload`)](#file-upload-helper-apiupload)
- [Response Unwrapping (`unwrap: true`)](#response-unwrapping-unwrap-true)
- [Diagnostic Debug Logger (`debug: true`)](#diagnostic-debug-logger-debug-true)
- [In-Flight Request Deduplication](#in-flight-request-deduplication)
- [Response Caching (LRU)](#response-caching-lru)
- [Resilient Retry Engine](#resilient-retry-engine)
- [Auth & Token Refresh Mutex](#auth--token-refresh-mutex)
- [Upload & Download Progress](#upload--download-progress)
- [Offline Request Queue](#offline-request-queue)
- [Node.js Enterprise Proxies & Dispatcher](#nodejs-enterprise-proxies--dispatcher)
- [Migration Guide (From Axios)](#migration-guide-from-axios)
- [Testing Locally with Your Team](#testing-locally-with-your-team)

---

## Why react-native-fetch-client?

Traditional HTTP clients like Axios were built over a decade ago around browser `XMLHttpRequest` (XHR), requiring polyfills and bulky dependencies on React Native, Expo, and modern Edge runtimes. Moreover, adding retries, token refresh mutexes, and caching requires stitching together 4 to 6 separate third-party packages.

`react-native-fetch-client` provides the complete modern networking stack in **one single, zero-dependency package**:

1. **Zero Production Dependencies (`dependencies: {}`)**: Eliminates supply-chain risks, CVE vulnerabilities, and `node_modules` bloat.
2. **First-Class TypeScript & Pure JavaScript**: Strict TypeScript generics plus full CommonJS (`require`) and ES Module (`import`) support.
3. **Native Multi-Runtime**: 100% compliant with WHATWG standards (`fetch`, `ReadableStream`, `AbortController`). Identical behavior across React Native, Expo, iOS, Android, modern browsers, Bun, and Node.js 18+.
4. **Single-Flight Auth Mutex**: Solves the classic race condition where parallel requests fail on 401s and trigger multiple refresh token calls.
5. **In-Flight Deduplication**: Coalesces concurrent identical `GET` requests into a single network flight with partial cancellation safety.
6. **Mutation-Aware LRU Cache**: Automatically invalidates cached GET routes whenever a POST/PUT/PATCH/DELETE mutation succeeds.
7. **Persistent Offline Queue**: Queues mutations offline and replays them sequentially with RFC-standard `Idempotency-Key` headers when reconnected.

---

## Installation

```bash
npm install react-native-fetch-client
```

Or using other package managers:
```bash
yarn add react-native-fetch-client
pnpm add react-native-fetch-client
bun add react-native-fetch-client
```

---

## Quick Start

### 1. TypeScript (ESM)

```typescript
import { createClient } from 'react-native-fetch-client';

interface User {
  id: number;
  name: string;
  email: string;
}

const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10_000,
});

// Strongly typed GET request
const response = await api.get<User[]>('/users');
console.log(response.status); // 200
console.log(response.data);   // User[]

// Strongly typed POST request
const created = await api.post<User>('/users', {
  name: 'Jane Doe',
  email: 'jane@example.com',
});
console.log('Created ID:', created.data.id);
```

### 2. JavaScript (ES Modules - `import`)

Works in modern frontend projects (React, Next.js, Vue, Vite) and Node.js (`"type": "module"`):

```javascript
import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

async function main() {
  const res = await api.get('/users');
  console.log(res.data);

  const newUser = await api.post('/users', {
    name: 'Jane Doe',
    email: 'jane@example.com',
  });
  console.log('Created user:', newUser.data);
}

main();
```

### 3. JavaScript (CommonJS - `require`)

Works in standard Node.js scripts, Express backends, and CommonJS projects:

```javascript
const { createClient, isHttpError } = require('react-native-fetch-client');

const api = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

async function main() {
  try {
    const res = await api.get('/users');
    console.log(res.data);
  } catch (err) {
    if (isHttpError(err)) {
      console.error('HTTP Error:', err.status, err.data);
    }
  }
}

main();
```

---

## HTTP Methods & Shorthands

Available in both TypeScript and JavaScript:

```typescript
// GET
const res = await api.get(url, config);

// POST
const res = await api.post(url, body, config);

// PUT
const res = await api.put(url, body, config);

// PATCH
const res = await api.patch(url, body, config);

// DELETE
const res = await api.delete(url, config);

// HEAD
const res = await api.head(url, config);

// OPTIONS
const res = await api.options(url, config);

// Generic Request
const res = await api.request({
  url: '/custom',
  method: 'POST',
  body: { foo: 'bar' },
});
```

---

## Request Configuration

Options can be specified globally in `createClient(config)` or overridden per-request:

```typescript
const config = {
  baseURL: 'https://api.example.com',
  timeout: 10000,                       // Timeout in ms (0 = disabled)
  headers: { 'Accept': 'application/json' },
  params: { page: 1, limit: 20 },       // Query parameters: ?page=1&limit=20
  responseType: 'json',                 // 'json' | 'text' | 'blob' | 'arrayBuffer' | 'none'
  credentials: 'same-origin',           // 'same-origin' | 'include' | 'omit'
  redirect: 'follow',                   // 'follow' | 'manual' | 'error'
  formUrlEncoded: false,                // Serializes plain objects to URL-encoded form
  signal: controller.signal,            // Caller cancellation signal
  onDownloadProgress: (event) => {},    // Streaming download callback
  onUploadProgress: (event) => {},      // Outgoing upload progress callback
  retry: { attempts: 3 },               // Retry policy
  cache: { enabled: true, ttl: 30000 }, // Response cache
  dedup: { enabled: true },             // In-flight request deduplication
  auth: { skip: true },                 // Bypass token injection for public routes
  dispatcher: customAgent,              // Undici ProxyAgent (Node.js proxies)
};
```

---

## Response Structure

Every successful call resolves to an `HttpResponse` object:

```javascript
const response = await api.get('/users');

console.log(response.data);       // Parsed response body (JSON, text, or Blob)
console.log(response.status);     // HTTP status code (e.g. 200)
console.log(response.statusText); // HTTP status text (e.g. "OK")
console.log(response.headers);    // Lowercased response headers object
console.log(response.cached);     // true if returned from local LRU cache
console.log(response.fromDedup);  // true if shared via concurrent in-flight flight
console.log(response.config);     // Resolved configuration used for request
console.log(response.request);    // Native WHATWG Request object
```

---

## Error Handling

Errors thrown by `react-native-fetch-client` are typed subclasses of `FetchNativeError`. Type guard functions are exported for safe discrimination:

#### TypeScript:
```typescript
import {
  isHttpError,
  isNetworkError,
  isTimeoutError,
  isCancelError,
  isRetryExhaustedError,
} from 'react-native-fetch-client';

try {
  await api.get('/orders');
} catch (err: unknown) {
  if (isHttpError(err)) {
    // Non-2xx response from the server (e.g. 400, 404, 500)
    console.error(`HTTP ${err.status}:`, err.data);
    console.error('Headers:', err.headers);
  } else if (isTimeoutError(err)) {
    // Request timed out past config.timeout
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (isCancelError(err)) {
    // Request was aborted by caller via AbortController
    console.warn('Request canceled by caller');
  } else if (isRetryExhaustedError(err)) {
    // Retried N times and all attempts failed
    console.error(`Failed after ${err.attempts} attempts. Last error:`, err.lastError);
  } else if (isNetworkError(err)) {
    // Offline, DNS resolution failure, or TCP connection reset
    console.error('Network connection error:', err.message);
  }
}
```

#### JavaScript:
```javascript
const { isHttpError, isTimeoutError, isCancelError } = require('react-native-fetch-client');

try {
  await api.get('/orders');
} catch (err) {
  if (isHttpError(err)) {
    console.error('Server returned HTTP', err.status, err.data);
  } else if (isTimeoutError(err)) {
    console.error('Request timed out!');
  } else if (isCancelError(err)) {
    console.warn('Request was aborted.');
  } else {
    console.error('Network or system error:', err.message);
  }
}
```

---

## Interceptors

Interceptors allow you to transform outgoing requests or inspect/recover from responses:

```javascript
// 1. Add Request Interceptor
const reqId = api.interceptors.request.use(
  (config) => {
    config.headers = {
      ...config.headers,
      'X-Client-Platform': 'mobile',
    };
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. Add Response Interceptor
const resId = api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.status === 403) {
      console.warn('Forbidden! Redirecting to permissions page...');
    }
    return Promise.reject(error);
  }
);

// 3. Eject Interceptors
api.interceptors.request.eject(reqId);
api.interceptors.response.eject(resId);

// 4. Clear all interceptors
api.interceptors.request.clear();
```

---

## Standard Schema Validation (`schema`)

Validate and parse incoming response payloads directly at runtime with **zero dependencies**. `react-native-fetch-client` uses duck-typing to seamlessly support:
- [Standard Schema v1 (`~standard`)](https://standardschema.dev/) (Zod 3.24+, Valibot, ArkType)
- Zod-like schemas (`.parse()`, `.safeParse()`)
- Plain validation functions `(data) => T`

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Throws ValidationError if response payload does not conform to the schema:
const response = await api.get('/user/me', {
  schema: UserSchema,
});

console.log(response.data.email); // Fully typed and runtime-validated!
```

---

## Native AI & SSE Streaming (`api.stream`)

Stream Server-Sent Events (SSE) or chunked LLM completions line-by-line using standard WHATWG `ReadableStream` and `AsyncGenerator`:

```typescript
// Connects to SSE endpoint with Accept: text/event-stream
for await (const chunk of api.stream('/v1/chat/completions', {
  method: 'POST',
  body: { model: 'gpt-4o', stream: true, messages: [{ role: 'user', content: 'Hello!' }] },
})) {
  console.log(`Event: ${chunk.event}, Data: ${chunk.data}`);
}
```

---

## Go/Rust-Style Safe Requests (`api.safe.*`)

Eliminate `try/catch` boilerplate. The `api.safe.*` namespace returns clean `[data, error]` result tuples:

```typescript
const [user, error] = await api.safe.get<User>('/users/123');

if (error) {
  console.error(`Request failed (${error.code}):`, error.message);
  return;
}

console.log('User loaded:', user.name);
```

---

## Client Concurrency Throttler (`maxConcurrentRequests`)

Cap the maximum number of simultaneous in-flight sockets across your entire application to avoid browser connection limits (HTTP/1.1 6-socket bottleneck) or mobile network congestion:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  maxConcurrentRequests: 4, // Max 4 concurrent sockets; excess wait in FIFO queue
});
```

---

## Circuit Breaker Pattern (`circuitBreaker`)

Prevent cascading outages when upstream microservices experience downtime. Automatically fails fast locally when consecutive errors exceed a configured threshold:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,   // Trip to OPEN after 5 consecutive 5xx/network failures
    resetTimeoutMs: 30000, // Probe in HALF_OPEN state after 30 seconds
  },
});
```

---

## RFC 7234 Conditional Caching (`ETag` & `304 Not Modified`)

Automatically stores `ETag` and `Last-Modified` headers. On subsequent requests, sends `If-None-Match` and `If-Modified-Since`. When the server returns `304 Not Modified`, reuses the cached response body while updating response headers:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    etag: true, // Enables conditional 304 validation
  },
});
```

---

## Auto-Pagination Helper (`api.paginate`)

Traverse multi-page APIs seamlessly using async generators (`for await`) or collect all pages directly:

```typescript
// 1. Stream items individually with for-await (Memory efficient!)
for await (const user of api.paginate<User>('/users', {
  pagination: { type: 'page', pageParam: 'page', pageSize: 20 },
})) {
  console.log(user.name);
}

// 2. Fetch all pages and flatten into an array in one call:
const allPosts = await api.paginate.all<Post>('/posts', {
  pagination: { type: 'page', pageParam: '_page', limitParam: '_limit', limit: 10 },
});
console.log(`Fetched ${allPosts.length} posts across all pages!`);
```

Supports 4 pagination strategies: `page`, `offset`, `cursor`, and RFC 5988/8288 standard `Link` headers.

---

## Persistent Storage Response Cache (`storage`)

Cache responses directly to mobile disk (MMKV, AsyncStorage, or localStorage) so data survives app restarts:

```typescript
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'http-cache' });

const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    storage: {
      getItem: (key) => mmkv.getString(key) ?? null,
      setItem: (key, value) => mmkv.set(key, value),
      removeItem: (key) => mmkv.delete(key),
    },
    defaultTtl: 300_000, // 5 minutes
  },
});

// Automatically hydrates from MMKV on startup!
// Immediate cache hit on cold app boots (0ms latency):
const res = await api.get('/user/profile');
```

---

## Stale-While-Revalidate (`strategy: 'stale-while-revalidate'`)

Return cached data instantly (**0ms latency**, `cached: true, stale: true`) to keep the UI buttery smooth, while quietly fetching the latest data from the network in the background:

```typescript
const res = await api.get('/dashboard/stats', {
  cache: {
    strategy: 'stale-while-revalidate',
    onRevalidated: (freshResponse) => {
      console.log('Background sync complete! Updated data:', freshResponse.data);
      updateUI(freshResponse.data);
    },
  },
});

console.log(res.stale); // true (Served immediately without network lag!)
```

---

## Declarative Testing Mock Adapter (`createMockAdapter`)

Zero-dependency unit testing for your network calls. Stub routes, simulate network timeouts or offline errors, and assert call history:

```typescript
import { createClient, createMockAdapter } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });
const mock = createMockAdapter(api);

// 1. Mock a route
mock.onGet('/users/active').reply(200, [{ id: 1, name: 'Alice' }]);

// 2. Simulate errors
mock.onPost('/billing/charge').replyWithTimeout();

// 3. Test & assert history
const res = await api.get('/users/active');
expect(res.data).toEqual([{ id: 1, name: 'Alice' }]);
expect(mock.history.get).toHaveLength(1);

// Clean up
mock.restore();
```

---

## Path Parameter Interpolation (`pathParams`)

Interpolate Express-style (`:param`) and OpenAPI-style (`{param}`) route variables with automated URI encoding:

```typescript
await api.get('/orgs/:orgId/projects/{projectId}/items/:itemId', {
  pathParams: {
    orgId: 'team-acme',
    projectId: 'proj-123',
    itemId: 'item#456', // Auto-encoded to item%23456
  },
});
```

---

## Bearer Token Preset (`bearerToken`)

Avoid manual interceptors for token attachment. Pass a static string or an asynchronous token getter:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  bearerToken: async () => await secureStorage.getItem('access_token'),
});
```

---

## File Upload Helper (`api.upload`)

Upload files, Blobs, ArrayBuffers, or FormDatas with automatic boundary resolution and upload progress:

```typescript
const avatarFile = fileInput.files[0];

const response = await api.upload('/users/avatar', avatarFile, {
  fieldName: 'avatar',
  fileName: 'photo.jpg',
  extraFields: { userId: 123 },
  onUploadProgress: (evt) => {
    console.log(`Upload progress: ${Math.round((evt.progress ?? 0) * 100)}%`);
  },
});
```

---

## Response Unwrapping (`unwrap: true`)

Directly return `response.data` instead of the full envelope:

```typescript
// Per-request unwrap:
const users = await api.get('/users', { unwrap: true });

// Or configure client-level unwrap:
const api = createClient({ unwrap: true });
const users = await api.get('/users'); // directly returns parsed data
```

---

## Diagnostic Debug Logger (`debug: true`)

Log outgoing requests with execution durations, status codes, and automatically redacted authentication tokens:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  debug: true, // or custom logger callback: (entry) => sendToDatadog(entry)
});
```

---

## In-Flight Request Deduplication


When multiple UI components mount simultaneously and request the exact same endpoint (e.g. `GET /api/me`), standard clients fire multiple HTTP requests over the wire. 

`react-native-fetch-client` coalesces them into **one single flight**:

```javascript
const api = createClient({
  baseURL: 'https://api.example.com',
  dedup: {
    enabled: true,               // Enable in-flight deduplication
    methods: ['GET', 'HEAD'],    // Methods eligible for deduplication
  },
});

// Fire 3 simultaneous calls
const [user1, user2, user3] = await Promise.all([
  api.get('/users/1'),
  api.get('/users/1'),
  api.get('/users/1'),
]);

console.log(user1.fromDedup); // false (Primary network socket)
console.log(user2.fromDedup); // true  (Subscribed to in-flight flight)
console.log(user3.fromDedup); // true  (Subscribed to in-flight flight)
```

> **Partial Cancellation Safety**: If `user2` calls `controller.abort()`, the underlying socket is **not** aborted; `user1` and `user3` still resolve normally.

---

## Response Caching (LRU)

Built-in in-memory LRU cache with automatic mutation invalidation and deep-clone immutability:

```javascript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    defaultTtl: 60000,          // Cache responses for 60 seconds
    maxSize: 100,               // Maximum 100 items in memory (LRU eviction)
    allowAuthenticated: false,  // Prevents leaking user-specific data across accounts
  },
});

// 1. Initial request (hits live network)
const r1 = await api.get('/products');
console.log(r1.cached); // false

// 2. Subsequent request within 60s (returns from RAM in ~0ms)
const r2 = await api.get('/products');
console.log(r2.cached); // true

// 3. Automatic Invalidation on Mutation:
// Executing POST, PUT, PATCH, or DELETE automatically purges matching cached paths!
await api.post('/products', { name: 'New Item' });

// 4. Next GET fetches fresh data from server
const r3 = await api.get('/products');
console.log(r3.cached); // false
```

---

## Resilient Retry Engine

Automatically retries transient network errors and 5xx gateway errors with exponential backoff, full jitter, and RFC `Retry-After` header parsing:

```javascript
const api = createClient({
  baseURL: 'https://api.example.com',
  retry: {
    attempts: 3,                   // Maximum 3 retry attempts
    delay: 500,                    // Initial backoff delay: 500ms
    maxDelay: 10000,               // Cap delay at 10 seconds
    backoff: 'exponential',        // 'exponential' | 'linear' | 'constant'
    jitter: true,                  // Applies full jitter to prevent thundering herds
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
});
```

> **RFC Retry-After**: If the server responds with `429 Too Many Requests` and a header `Retry-After: 5` or `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`, the client automatically pauses for the specified duration before retrying.

---

## Auth & Token Refresh Mutex

Solves race conditions when multiple parallel requests receive 401s on expired access tokens:

```javascript
let currentAccessToken = 'initial_token';

const api = createClient({
  baseURL: 'https://api.example.com',
  auth: {
    // 1. Returns current token (called before each request)
    getToken: () => currentAccessToken,

    // 2. Single-flight mutex refresh callback:
    // If 10 requests fail with 401 simultaneously, refreshToken is called EXACTLY ONCE.
    // The other 9 requests wait, then replay with the new token.
    refreshToken: async () => {
      const res = await fetch('https://api.example.com/oauth/refresh', { method: 'POST' });
      const data = await res.json();
      currentAccessToken = data.access_token;
      return currentAccessToken;
    },

    headerName: 'Authorization',
    tokenType: 'Bearer',
  },
});
```

---

## Upload & Download Progress

Monitor real-time progress for both uploads and downloads:

### 1. Upload Progress (`onUploadProgress`)

```javascript
const fileBlob = new Blob(['sample data'], { type: 'text/plain' });

await api.post('/upload', fileBlob, {
  onUploadProgress: (event) => {
    const percent = Math.round((event.loaded / event.total) * 100);
    console.log(`Uploaded ${event.loaded} / ${event.total} bytes (${percent}%)`);
  },
});
```

### 2. Streaming Download Progress (`onDownloadProgress`)

Uses WHATWG `ReadableStream` to stream chunks without buffering the whole response in memory:

```javascript
await api.get('/downloads/big-file.zip', {
  responseType: 'blob',
  onDownloadProgress: (event) => {
    console.log(`Received chunk: ${event.bytes} bytes. Total loaded: ${event.loaded} bytes`);
  },
});
```

---

## Offline Request Queue

Queue mutations when the device is offline and replay them deterministically when connectivity returns:

```javascript
const { createClient, createOfflineQueue, MemoryStorageAdapter } = require('react-native-fetch-client');

const api = createClient({ baseURL: 'https://api.example.com' });

// Initialize queue with any storage engine (AsyncStorage, localStorage, IndexedDB)
const queue = createOfflineQueue({
  client: api,
  storage: new MemoryStorageAdapter(), // Or custom AsyncStorage adapter
  maxQueueSize: 100,                   // Cap at 100 queued items
  maxAttempts: 5,                      // Drop poison-pills after 5 attempts
  idempotencyHeader: 'Idempotency-Key',// Automatically attaches UUID idempotency key
  onReplaySuccess: (req) => {
    console.log(`Synced offline mutation: ${req.method} ${req.url}`);
  },
  onPermanentFailure: (req, err) => {
    console.error(`Mutation failed permanently: ${req.url}`, err.message);
  },
});

// 1. Enqueue action when network is lost:
await queue.enqueue({
  url: '/notes',
  method: 'POST',
  body: { title: 'Drafted while offline' },
});

// 2. Replay queue sequentially when back online:
const summary = await queue.process();
console.log(`Replay complete: ${summary.succeeded} succeeded, ${summary.remaining} remaining.`);
```

> **Financial Endpoint Guardrail**: Requests targeting `/pay`, `/checkout`, `/orders`, `/charge`, or `/billing` are strictly rejected from offline queuing by default to prevent unexpected delayed charges.

---

## Node.js Enterprise Proxies & Dispatcher

In Node.js 18+ environments, pass an Undici `ProxyAgent` to route requests through corporate forward proxies or custom mTLS agents:

```javascript
const { ProxyAgent } = require('undici');
const { createClient } = require('react-native-fetch-client');

const proxyClient = createClient({
  baseURL: 'https://internal.corp',
  dispatcher: new ProxyAgent('http://corporate-proxy.internal:8080'),
});
```

---

## Migration Guide (From Axios)

Switching from Axios takes only a few minutes. Most method signatures are identical:

| Axios | `react-native-fetch-client` | Notes |
| :--- | :--- | :--- |
| `axios.get(url, config)` | `client.get(url, config)` | Identical |
| `axios.post(url, data, config)` | `client.post(url, data, config)` | Identical |
| `res.data` | `res.data` | Identical |
| `axios.interceptors.request.use()` | `client.interceptors.request.use()` | Identical |
| `axios.isAxiosError(err)` | `isHttpError(err)` or `isFetchNativeError(err)` | Type-safe guards |
| `axios-retry` (plugin) | `client = createClient({ retry: {...} })` | Built-in |
| `axios-cache-interceptor` (plugin) | `client = createClient({ cache: {...} })` | Built-in |

---

## Testing Locally with Your Team

To test this library within your team before publishing to public npm:

### Option 1: Pack as a Local `.tgz` Tarball
```bash
# In react-native-fetch-client:
npm run build
npm pack
# Generates react-native-fetch-client-0.1.0.tgz
```
Share `react-native-fetch-client-0.1.0.tgz` with your teammate. In their project, they install:
```bash
npm install ./path/to/react-native-fetch-client-0.1.0.tgz
```

### Option 2: Local `npm link`
```bash
# In react-native-fetch-client:
npm link

# In teammate's project:
npm link react-native-fetch-client
```

---

## Verification & Quality Gates

The codebase enforces strict quality checks:

```bash
npm run typecheck      # Strict TypeScript check (0 errors)
npm test               # 13 Vitest suites, 143 unit/integration tests (0 failures)
npm run lint           # ESLint 10 verification
npm run build          # Dual ESM & CJS build via tsup
```

---

## License

[MIT](LICENSE) © 2026
