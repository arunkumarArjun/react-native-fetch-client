# react-native-fetch-client

> **A high-performance, Fetch-native HTTP client for TypeScript & JavaScript (React Native, Expo, modern browsers, and Node.js).**  
> Zero runtime dependencies • Dual ESM & CJS • In-flight Request Deduplication • Response Caching & SWR • Auth Mutex • Offline Queue • Streaming Progress

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml/badge.svg)](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml)
[![Socket.dev Security](https://badge.socket.dev/npm/react-native-fetch-client.svg)](https://socket.dev/npm/package/react-native-fetch-client)
[![Security Policy](https://img.shields.io/badge/Security-Policy-brightgreen.svg)](SECURITY.md)
[![TypeScript & JavaScript](https://img.shields.io/badge/Languages-TypeScript%20%7C%20JavaScript-blue)](https://www.typescriptlang.org/)
[![Runtime Dependencies](https://img.shields.io/badge/Dependencies-0-success.svg)](package.json)
[![Tests: 193 passing](https://img.shields.io/badge/Tests-193%20Passing-brightgreen.svg)](test)
[![Expo & React Native](https://img.shields.io/badge/React%20Native-Bridgeless%20%26%20New%20Arch%20Ready-success.svg)](https://reactnative.dev)

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
- [Feature Comparison](#feature-comparison)
- [Installation](#installation)
- [Quick Start (TypeScript & JavaScript)](#quick-start)
  - [TypeScript (ESM)](#1-typescript-esm)
  - [JavaScript (ES Modules - `import`)](#2-javascript-es-modules---import)
  - [JavaScript (CommonJS - `require`)](#3-javascript-commonjs---require)
- [HTTP Methods & Shorthands](#http-methods--shorthands)
- [Go/Rust-Style Safe Requests (`api.safe.*`)](#gorust-style-safe-requests-apisafe)
- [Standard Schema Validation (`schema`)](#standard-schema-validation-schema)
- [Auto-Pagination Helper (`api.paginate`)](#auto-pagination-helper-apipaginate)
- [Smart Polling Helper (`api.poll`)](#smart-polling-helper-apipoll)
- [Native AI & SSE Streaming (`api.stream`)](#native-ai--sse-streaming-apistream)
- [Search Autocomplete Auto-Cancel (`cancelPrevious`)](#search-autocomplete-auto-cancel-cancelprevious)
- [Declarative Testing Mock Adapter (`createMockAdapter`)](#declarative-testing-mock-adapter-createmockadapter)
- [Response Caching, SWR & Persistent Storage](#response-caching-swr--persistent-storage)
  - [In-Memory LRU Cache](#1-in-memory-lru-cache)
  - [Persistent Storage (MMKV / AsyncStorage)](#2-persistent-storage-adapter-storage)
  - [Stale-While-Revalidate (SWR)](#3-stale-while-revalidate-swr)
  - [RFC 7234 Conditional Validation (ETag & 304)](#4-rfc-7234-conditional-validation-etag--304)
  - [Declarative Cache Invalidation (`invalidate`)](#5-declarative-cache-invalidation-invalidate)
- [Client Concurrency Throttler (`maxConcurrentRequests`)](#client-concurrency-throttler-maxconcurrentrequests)
- [Circuit Breaker Pattern (`circuitBreaker`)](#circuit-breaker-pattern-circuitbreaker)
- [In-Flight Request Deduplication (`dedup`)](#in-flight-request-deduplication-dedup)
- [Resilient Retry Engine (`retry`)](#resilient-retry-engine-retry)
- [Auth & Token Refresh Mutex (`auth`)](#auth--token-refresh-mutex-auth)
- [Bearer Token Preset (`bearerToken`)](#bearer-token-preset-bearertoken)
- [Path Parameter Interpolation (`pathParams`)](#path-parameter-interpolation-pathparams)
- [Request Latency Metric (`response.durationMs`)](#request-latency-metric-responsedurationms)
- [File Upload Helper (`api.upload`)](#file-upload-helper-apiupload)
- [Upload & Download Progress](#upload--download-progress)
- [Offline Request Queue (`createOfflineQueue`)](#offline-request-queue-createofflinequeue)
- [Response Unwrapping (`unwrap: true`)](#response-unwrapping-unwrap-true)
- [Diagnostic Debug Logger (`debug: true`)](#diagnostic-debug-logger-debug-true)
- [Node.js Enterprise Proxies & Dispatcher](#nodejs-enterprise-proxies--dispatcher)
- [Migration Guide (From Axios)](#migration-guide-from-axios)
- [License](#license)

---

## Why react-native-fetch-client?

Traditional HTTP clients like Axios were built over a decade ago around browser `XMLHttpRequest` (XHR), requiring polyfills and bulky dependencies on React Native, Expo, and modern Edge runtimes. Moreover, adding retries, token refresh mutexes, and caching requires stitching together 4 to 6 separate third-party packages.

`react-native-fetch-client` provides the complete modern networking stack in **one single, zero-dependency package**:

1. **Zero Production Dependencies (`dependencies: {}`)**: Eliminates supply-chain risks, CVE vulnerabilities, and `node_modules` bloat.
2. **First-Class TypeScript & Pure JavaScript**: Strict TypeScript generics plus full CommonJS (`require`) and ES Module (`import`) support.
3. **Native Multi-Runtime**: 100% compliant with WHATWG standards (`fetch`, `ReadableStream`, `AbortController`). Identical behavior across React Native (New Architecture & Bridgeless), Expo, iOS, Android, modern browsers, Bun, and Node.js 18+.
4. **Single-Flight Auth Mutex**: Solves the classic race condition where parallel requests fail on 401s and trigger multiple refresh token calls.
5. **In-Flight Deduplication**: Coalesces concurrent identical `GET` requests into a single network flight with partial cancellation safety.
6. **Mutation-Aware LRU Cache & SWR**: Delivers 0ms instant cached data with background revalidation, and automatically invalidates cached GET routes whenever a mutation succeeds.
7. **Persistent Offline Queue**: Queues mutations offline and replays them sequentially with RFC-standard `Idempotency-Key` headers when reconnected.

---

## Feature Comparison

| Feature | `react-native-fetch-client` | Axios (`axios`) | Native Fetch |
| :--- | :---: | :---: | :---: |
| **Runtime Dependencies** | **0 (Zero)** | ~4-6 | **0** |
| **React Native New Architecture** | ✅ Native Bridgeless | ⚠️ Legacy XHR | ✅ Native |
| **Single-Flight 401 Auth Mutex** | ✅ Built-in | ❌ Manual Code | ❌ None |
| **SWR Caching Strategy (0ms)** | ✅ Built-in | ❌ Needs Plugin | ❌ None |
| **Persistent Storage (MMKV / Storage)** | ✅ Built-in | ❌ None | ❌ None |
| **In-Flight Request Deduplication** | ✅ Built-in | ❌ Needs Plugin | ❌ None |
| **Circuit Breaker** | ✅ Built-in | ❌ None | ❌ None |
| **Auto-Pagination Helper** | ✅ Built-in | ❌ None | ❌ None |
| **Smart Polling Helper (`api.poll`)** | ✅ Built-in | ❌ None | ❌ None |
| **Autocomplete Auto-Cancel (`cancelPrevious`)** | ✅ Built-in | ❌ Manual Abort | ❌ Manual Abort |
| **Request Latency (`response.durationMs`)** | ✅ Built-in | ❌ Manual Timing | ❌ None |
| **Declarative Mock Adapter** | ✅ Built-in | ❌ Separate Pkg | ❌ None |
| **Go/Rust Safe Requests (`api.safe`)** | ✅ Built-in | ❌ None | ❌ None |
| **Standard Schema / Zod Validation** | ✅ Built-in | ❌ None | ❌ None |
| **Offline Mutation Queue** | ✅ Built-in | ❌ None | ❌ None |

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

## Go/Rust-Style Safe Requests (`api.safe.*`)

Eliminate `try/catch` boilerplate. The `api.safe.*` namespace returns clean `[data, error]` result tuples where exactly one value is populated:

```typescript
const [user, error] = await api.safe.get<User>('/users/123');

if (error) {
  console.error(`Request failed (${error.code}):`, error.message);
  return;
}

// Guaranteed non-null and fully typed!
console.log('User loaded:', user.name);
```

---

## Standard Schema Validation (`schema`)

Validate response payloads at runtime using the **Standard Schema v1** specification, Zod, Valibot, or custom validation functions:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Throws ValidationError with detailed issue paths if schema fails:
const res = await api.get('/users/1', {
  schema: UserSchema,
});

console.log(res.data.email);
```

---

## Auto-Pagination Helper (`api.paginate`)

Traverse multi-page APIs seamlessly using async generators (`for await`) or collect all pages into an array in one call:

```typescript
// 1. Stream items individually with for-await (Memory efficient!)
for await (const user of api.paginate<User>('/users', {
  pagination: { type: 'page', pageParam: 'page', pageSize: 20 },
})) {
  console.log(user.name);
}

// 2. Fetch all pages and flatten into an array:
const allPosts = await api.paginate.all<Post>('/posts', {
  pagination: { type: 'page', pageParam: '_page', limitParam: '_limit', limit: 10 },
});
console.log(`Fetched ${allPosts.length} posts across all pages!`);
```

Supports 4 pagination strategies: `page`, `offset`, `cursor`, and RFC 5988/8288 standard `Link` headers.

---

## Smart Polling Helper (`api.poll`)

Poll asynchronous jobs (such as payment processing, background export generation, or order fulfillment) until a predicate matches:

```typescript
const payment = await api.poll<PaymentStatus>('/orders/123/status', {
  interval: 1000,    // Poll every 1s
  timeout: 30000,    // Throw TimeoutError after 30s
  backoff: 1.5,      // Optional exponential backoff multiplier
  until: (res) => res.data.status === 'COMPLETED',
});

console.log('Payment finalized:', payment.data.transactionId);
```

---

## Native AI & SSE Streaming (`api.stream`)

Consume Server-Sent Events (SSE) and AI LLM token streams (OpenAI, Anthropic, Gemini, Ollama) using native async generators:

```typescript
const eventStream = api.stream('/chat/completions', {
  method: 'POST',
  body: {
    model: 'gpt-4o',
    stream: true,
    messages: [{ role: 'user', content: 'Hello!' }],
  },
});

for await (const chunk of eventStream) {
  if (chunk.data === '[DONE]') break;
  const parsed = JSON.parse(chunk.data);
  process.stdout.write(parsed.choices[0]?.delta?.content ?? '');
}
```

---

## Search Autocomplete Auto-Cancel (`cancelPrevious`)

Eliminate race conditions in search inputs. If a user types quickly (`"a" -> "ap" -> "app"`), older in-flight requests in the same cancellation group are automatically aborted:

```typescript
// Rapidly typing new queries cancels the previous search request automatically:
const searchResults = await api.get('/search', {
  params: { q: text },
  cancelPrevious: 'user-search', // Shared group key
});
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

## Response Caching, SWR & Persistent Storage

A complete multi-tier caching engine with in-memory LRU, persistent disk storage, Stale-While-Revalidate (SWR), and RFC 7234 conditional validation.

### 1. In-Memory LRU Cache
```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    defaultTtl: 60000,          // Cache responses for 60 seconds
    maxSize: 100,               // Maximum 100 items in memory (LRU eviction)
    allowAuthenticated: false,  // Prevents leaking user-specific data across accounts
  },
});

// Initial request hits network; second request returns in ~0ms:
const r1 = await api.get('/products');
const r2 = await api.get('/products');
console.log(r2.cached); // true

// Automatic Invalidation on Mutation:
// Executing POST, PUT, PATCH, or DELETE automatically purges matching cached paths!
await api.post('/products', { name: 'New Item' });
```

### 2. Persistent Storage Adapter (`storage`)
Plug directly into high-speed mobile storage (MMKV or AsyncStorage) so cached responses survive app restarts:

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

// Instant cache hit on cold app boots (0ms latency):
const res = await api.get('/user/profile');
```

### 3. Stale-While-Revalidate (SWR)
Return cached data instantly (**0ms latency**, `cached: true, stale: true`) to keep the UI responsive, while quietly fetching the latest data from the network in the background:

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

### 4. RFC 7234 Conditional Validation (`ETag` & `304`)
Automatically stores `ETag` and `Last-Modified` headers. On subsequent requests, sends `If-None-Match`. When the server returns `304 Not Modified`, reuses the cached response body while updating headers:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    etag: true, // Enables conditional 304 validation
  },
});
```

### 5. Declarative Cache Invalidation (`invalidate`)
Purge related collection endpoints from the cache whenever an individual entity is created, updated, or deleted:

```typescript
// Mutating /users/42 automatically invalidates both /users/42 AND the /users list cache:
await api.put('/users/42', { name: 'Alice' }, {
  cache: {
    invalidate: ['/users'], // Accepts route strings or RegExp patterns
  },
});
```

---

## Client Concurrency Throttler (`maxConcurrentRequests`)

Cap the maximum number of simultaneous in-flight sockets across your application to avoid mobile network congestion or connection bottlenecks:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  maxConcurrentRequests: 4, // Max 4 concurrent sockets; excess wait in FIFO queue
});
```

---

## Circuit Breaker Pattern (`circuitBreaker`)

Prevent cascading outages when upstream services experience downtime. Automatically fails fast locally when consecutive errors exceed a configured threshold:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,   // Trip to OPEN after 5 consecutive failures
    resetTimeoutMs: 30000, // Probe in HALF_OPEN state after 30 seconds
  },
});
```

---

## In-Flight Request Deduplication (`dedup`)

Coalesces concurrent identical `GET` requests into **one single flight**, preventing duplicate calls when multiple UI components mount simultaneously:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  dedup: {
    enabled: true,
    methods: ['GET', 'HEAD'],
  },
});

// Fire 3 simultaneous calls: exactly 1 network socket is opened!
const [user1, user2, user3] = await Promise.all([
  api.get('/users/1'),
  api.get('/users/1'),
  api.get('/users/1'),
]);

console.log(user1.fromDedup); // false (Primary network socket)
console.log(user2.fromDedup); // true  (Subscribed to in-flight flight)
console.log(user3.fromDedup); // true  (Subscribed to in-flight flight)
```

---

## Resilient Retry Engine (`retry`)

Automatically retries transient network errors and 5xx gateway errors with exponential backoff, full jitter, and RFC `Retry-After` header parsing:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  retry: {
    attempts: 3,                   // Maximum 3 retry attempts
    delay: 500,                    // Initial backoff delay: 500ms
    maxDelay: 10000,               // Cap delay at 10 seconds
    backoff: 'exponential',        // 'exponential' | 'linear'
    jitter: true,                  // Applies full jitter to prevent thundering herds
    retryOn: [408, 429, 500, 502, 503, 504],
    respectRetryAfter: true,       // Respects Retry-After response header
  },
});
```

---

## Auth & Token Refresh Mutex (`auth`)

Solves the race condition where parallel requests fail on 401s and trigger multiple refresh token calls simultaneously:

```typescript
let currentAccessToken = 'initial_token';

const api = createClient({
  baseURL: 'https://api.example.com',
  bearerToken: () => currentAccessToken,
  auth: {
    // Single-flight mutex refresh callback:
    // If 10 requests fail with 401 simultaneously, refreshToken is called EXACTLY ONCE.
    // The other 9 requests wait, then replay with the new token.
    refreshToken: async () => {
      const res = await fetch('https://api.example.com/oauth/refresh', { method: 'POST' });
      const data = await res.json();
      currentAccessToken = data.access_token;
      return currentAccessToken;
    },
    // Optional proactive refresh: Refresh token BEFORE dispatching if already expired!
    isExpired: () => Date.now() > tokenExpiresAt,
    refreshOn: [401],
    refreshExcludeUrls: ['/oauth/refresh', '/auth/login'],
    headerName: 'Authorization',
    tokenPrefix: 'Bearer ',
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

## Request Latency Metric (`response.durationMs`)

Track network roundtrip durations out of the box for APM monitoring, Datadog, Sentry, or UI latency badges:

```typescript
const response = await api.get('/products');
console.log(`Endpoint returned in ${response.durationMs}ms`);
```

---

## File Upload Helper (`api.upload`)

Upload files, Blobs, ArrayBuffers, or FormDatas with automatic boundary resolution:

```typescript
const avatarFile = fileInput.files[0];

const response = await api.upload('/users/avatar', avatarFile, {
  fieldName: 'avatar',
  fileName: 'photo.jpg',
  additionalFields: { userId: 123 },
  onUploadProgress: (evt) => {
    console.log(`Upload progress: ${evt.percent}%`);
  },
});
```

---

## Upload & Download Progress

Monitor real-time progress for both uploads and downloads:

```typescript
// 1. Upload Progress
await api.post('/upload', fileBlob, {
  onUploadProgress: (event) => {
    console.log(`Uploaded ${event.loaded} / ${event.total} bytes (${event.percent}%)`);
  },
});

// 2. Download Progress
await api.get('/downloads/big-file.zip', {
  responseType: 'blob',
  onDownloadProgress: (event) => {
    console.log(`Downloaded ${event.loaded} / ${event.total} bytes (${event.percent}%)`);
  },
});
```

---

## Offline Request Queue (`createOfflineQueue`)

Queue mutations when the device is offline and replay them deterministically when connectivity returns:

```typescript
import { createClient, createOfflineQueue, MemoryStorageAdapter } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });

const queue = createOfflineQueue({
  client: api,
  storage: new MemoryStorageAdapter(), // Or MMKV / AsyncStorage adapter
  maxQueueSize: 100,
  maxAttempts: 5,
  idempotencyHeader: 'Idempotency-Key', // Automatically attaches UUID idempotency key
  onReplaySuccess: (req) => {
    console.log(`Synced offline mutation: ${req.method} ${req.url}`);
  },
  onPermanentFailure: (req, err) => {
    console.error(`Mutation failed permanently: ${req.url}`, err);
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

> **🛡️ Idempotency-Key & Cold App Restarts:**
> - The assigned `Idempotency-Key` is persisted to disk alongside the request payload and headers. It survives complete app terminations and cold restarts.
> - **Backend Requirement:** A client header alone cannot make a non-idempotent server endpoint safe. For safe replays, your backend must implement idempotency key tracking (e.g., Stripe/IETF standard via Redis/Postgres) so that replayed requests return the existing record instead of creating duplicates.
> - By default, payment and checkout routes (`/pay`, `/checkout`, `/order`, `/billing`) are blocked from offline queuing to prevent unsafe retries.

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
  debug: true, // or custom logger callback: (entry) => sendToTelemetry(entry)
});
```

---

## Node.js Enterprise Proxies & Dispatcher

In Node.js 18+ environments, pass an Undici `ProxyAgent` to route requests through corporate forward proxies:

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
| `axios-mock-adapter` (package) | `mock = createMockAdapter(client)` | Built-in |

---

## Security

For security vulnerability reporting, please see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) © 2026 Arunkumar Arjunan
