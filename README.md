# react-native-fetch-client

A lightweight, Fetch-native HTTP client for TypeScript and JavaScript across React Native, Expo, web browsers, and Node.js.

[![npm version](https://img.shields.io/npm/v/react-native-fetch-client.svg)](https://www.npmjs.com/package/react-native-fetch-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml/badge.svg)](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/tests-240%20passed-brightgreen.svg)](test)

---

## Overview

`react-native-fetch-client` provides a unified HTTP networking engine built on standard WHATWG primitives (`fetch`, `ReadableStream`, `AbortController`). It replaces legacy XMLHttpRequest-based libraries like Axios with a modern, zero-dependency client optimized for mobile, web, and server environments.

### Key Capabilities

- **Zero Runtime Dependencies**: The package has zero production dependencies (`dependencies: {}`), eliminating supply chain vulnerabilities and minimizing bundle footprint.
- **Cross-Platform Native**: Runs identically across React Native (including Bridgeless and the New Architecture), Expo, modern browsers, Node.js 18+, and edge runtimes.
- **Single-Flight Auth Mutex**: Solves the token refresh race condition when multiple parallel requests receive 401 Unauthorized responses. Exactly one refresh request is executed; concurrent requests queue and replay automatically with the new token.
- **Universal DevTools Stealth Mode**: Built-in privacy filter (`hideFromDevTools`) suppresses sensitive endpoints (credentials, payments, biometrics) from appearing in Chrome Inspect, Hermes Debugger, and Flipper.
- **Async Job & Webhook Waiter**: Dedicated `api.waitFor()` method for polling payment settlement (3DS, Apple Pay, UPI), KYC verification, or background jobs with error suppression, backoff capping, and abort criteria.
- **In-Flight Request Deduplication**: Coalesces concurrent identical `GET` requests into a single network flight, returning the shared result while preserving individual abort control.
- **Response Caching and SWR**: Multi-tier caching with in-memory LRU, persistent storage adapters (MMKV, AsyncStorage), RFC 7234 conditional validation (ETag / 304), and Stale-While-Revalidate (SWR) background revalidation.
- **Resilient Fault Tolerance**: Configurable exponential backoff retries with full jitter, server `Retry-After` adherence, circuit breaker protection, and global concurrency throttling.
- **Native AI and SSE Streaming**: Consume Server-Sent Events (SSE) and AI LLM token streams (OpenAI, Anthropic, Gemini, Ollama) using standard async generators (`for await...of`).
- **Safe Tuple Requests**: Go- and Rust-style error handling with `api.safe.*`, returning typed `[data, error]` tuples without nested `try/catch` blocks.
- **Standard Schema Validation**: Validate response payloads at runtime using Standard Schema v1 (Zod, Valibot, ArkType) with compile-time type inference.
- **Auto-Pagination**: Helper for traversing paginated endpoints across page-number, offset-limit, cursor-based, and RFC 5988/8288 `Link` header APIs.
- **Offline Request Queue**: Queue mutations while offline and replay them sequentially with persistent UUID idempotency headers when connectivity returns.
- **Testing Mock Adapter**: Built-in declarative mocking utility (`createMockAdapter`) for stubbing routes, simulating network delays or errors, and inspecting call history without external mocking packages.

---

## Documentation

Comprehensive guides are available in the [`docs/`](./docs) directory:

- [Architecture and Execution Flow](./docs/architecture-flow.md)
- [Core Features and Usage Guide](./docs/core-features-guide.md)
- [Caching and Stale-While-Revalidate](./docs/caching-and-swr.md)
- [Resilience, Retries, and Offline Queue](./docs/resilience-and-offline.md)
- [Streaming, AI, and File Uploads](./docs/streaming-and-uploads.md)
- [Authentication and Security](./docs/auth-and-security.md)
- [Auto-Pagination Helper](./docs/auto-pagination.md)
- [Testing and Mock Adapter](./docs/testing-and-mocking.md)

---

## Feature Comparison

| Capability | react-native-fetch-client | Axios | Native Fetch |
| :--- | :--- | :--- | :--- |
| **Runtime Dependencies** | **0** | ~4-6 | 0 |
| **React Native New Architecture** | Native (Bridgeless) | Legacy XHR bridge | Native |
| **Single-Flight 401 Auth Mutex** | Built-in | Manual implementation | None |
| **DevTools Privacy Filter (Stealth Mode)** | Built-in (`hideFromDevTools`) | None | None |
| **Async Webhook / Job Waiter** | Built-in (`api.waitFor`) | None | None |
| **In-Flight Request Deduplication** | Built-in | Plugin required | None |
| **Response Caching & SWR** | Built-in | Plugin required | None |
| **Persistent Storage Adapter (MMKV)** | Built-in | None | None |
| **Circuit Breaker** | Built-in | None | None |
| **Concurrency Throttling** | Built-in | Separate package | None |
| **Smart Polling Helper** | Built-in (`api.poll`) | None | None |
| **Autocomplete Auto-Cancel** | Built-in (`cancelPrevious`) | Manual AbortController | Manual AbortController |
| **Standard Schema / Zod Validation** | Built-in | None | None |
| **Safe Error Tuples (`[data, error]`)** | Built-in (`api.safe`) | None | None |
| **Declarative Mock Adapter** | Built-in | Separate package | None |
| **Offline Mutation Queue** | Built-in | None | None |

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
console.log(response.data);   // User[]

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

### JavaScript (CommonJS)

```javascript
const { createClient, isHttpError } = require('react-native-fetch-client');

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

---

## HTTP Methods

All standard HTTP methods are supported:

```typescript
// Standard requests
const getRes  = await api.get('/users', config);
const postRes = await api.post('/users', body, config);
const putRes  = await api.put('/users/1', body, config);
const patRes  = await api.patch('/users/1', body, config);
const delRes  = await api.delete('/users/1', config); // Alias: api.del()
const headRes = await api.head('/users/1', config);
const optRes  = await api.options('/users', config);

// General-purpose request method
const custom = await api.request<User>({
  url: '/users/search',
  method: 'POST',
  body: { query: 'Jane' },
});
```

---

## Safe Requests (`api.safe.*`)

Returns a typed `[data, error]` tuple instead of throwing exceptions, avoiding `try/catch` nesting:

```typescript
const [user, error] = await api.safe.get<User>('/users/123');

if (error) {
  console.error(`Request failed (${error.code}):`, error.message);
  return;
}

// user is guaranteed non-null and typed as User
console.log('Loaded user:', user.name);
```

All HTTP methods are available under the `.safe` namespace (`api.safe.get`, `api.safe.post`, `api.safe.put`, `api.safe.patch`, `api.safe.delete`, `api.safe.request`).

---

## Standard Schema Validation (`schema`)

Validate response data at runtime using Standard Schema v1 compliant libraries (such as Zod, Valibot, or ArkType) or functional validators:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

// Throws ValidationError with detailed issue paths if validation fails:
const res = await api.get('/users/1', {
  schema: UserSchema,
});

console.log(res.data.email);
```

---

## Async Webhook and Resource Waiter (`api.waitFor`)

`api.waitFor` polls an endpoint until a terminal condition is satisfied. It is designed for asynchronous operations such as payment webhooks, KYC verification, background jobs, and cloud provisioning:

```typescript
import { createClient, isWaitForAbortedError } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });

try {
  const order = await api.waitFor<Order>('/orders/ord-992/status', {
    // 1. Success condition
    until: (res) => res.data.status === 'succeeded',

    // 2. Early failure exit: terminates immediately without waiting for timeout
    stopIf: (res) => res.data.status === 'failed',

    // 3. Error suppression: tolerates 404 while backend worker creates the record
    ignoreErrors: [404],

    // 4. Backoff interval and ceiling cap
    interval: 1000,
    backoff: 1.5,
    maxInterval: 5000,
    timeout: 60_000,
    maxAttempts: 25,

    // 5. Progress notification callback
    onTick: ({ attempt, elapsedMs }) => {
      console.log(`Polling status (attempt ${attempt}, ${Math.round(elapsedMs / 1000)}s)...`);
    },

    // 6. AbortSignal cancellation
    signal: abortController.signal,
  });

  console.log('Order finalized:', order.data.receiptUrl);
} catch (err) {
  if (isWaitForAbortedError(err)) {
    console.error('Order failed immediately:', err.response.data);
  }
}
```

### Options Reference for `api.waitFor`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `until` | `(res: HttpResponse<T>) => boolean \| Promise<boolean>` | **Required** | Predicate returning true when the target state is reached. |
| `stopIf` | `(res: HttpResponse<T>) => boolean \| Promise<boolean>` | `undefined` | Early termination predicate. Throws `WaitForAbortedError` immediately if true. |
| `ignoreErrors` | `number[] \| boolean` | `[404]` | HTTP status codes to ignore and continue polling. Pass `true` to ignore all HTTP errors. |
| `interval` | `number` | `1000` | Initial delay between polling attempts in milliseconds (minimum 50ms). |
| `maxInterval` | `number` | `10000` | Ceiling cap on interval delay when using exponential backoff. |
| `backoff` | `number` | `1` | Multiplier applied to interval after each attempt. |
| `timeout` | `number` | `30000` | Total overall timeout in milliseconds. Aborts active requests upon expiry. |
| `maxAttempts` | `number` | `Infinity` | Maximum number of attempts allowed before throwing `TimeoutError`. |
| `onTick` | `(info: { attempt, elapsedMs, response? }) => void` | `undefined` | Callback invoked after each attempt. |
| `signal` | `AbortSignal` | `undefined` | AbortSignal to cancel polling and any active in-flight request immediately. |

---

## Periodic Polling (`api.poll`)

For lightweight periodic polling of jobs with simple success conditions:

```typescript
const job = await api.poll<JobStatus>('/jobs/export-123', {
  interval: 1000,
  timeout: 30000,
  backoff: 1.25,
  until: (res) => res.data.status === 'COMPLETED',
});
```

---

## Universal DevTools Stealth Mode (`hideFromDevTools`)

Suppresses sensitive endpoints (auth tokens, payment card data, biometric credentials) from appearing in developer debugging tools:

```typescript
import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://api.example.com',

  // Client-level configuration:
  // Accepts boolean, string substrings, or RegExp patterns:
  hideFromDevTools: ['/auth', '/payment', /card-\d+/],
});

// Outgoing calls to matching endpoints are suppressed from DevTools:
await api.post('/payment/charge', paymentDetails);

// Or configure per-request:
await api.get('/account/private-keys', {
  hideFromDevTools: true,
});
```

### Platform Behavior Matrix

| Environment | DevTools Suppression | Console & Diagnostic Logs |
| :--- | :--- | :--- |
| **React Native (iOS and Android)** | **Full Stealth**<br>Hooks React Native's internal `XHRInterceptor` to drop both request send and response delivery callbacks. Suppressed from Chrome Inspect (`chrome://inspect`), Hermes Debugger, and Flipper. | **Suppressed**<br>Excluded from Metro console, debug loggers, and telemetry error leaks. |
| **Web Browsers (Chrome, Firefox, Safari, Edge)** | **Console Stealth Only**<br>Under W3C security standards, browser C++ network panels cannot be suppressed by JavaScript. | **Suppressed**<br>Mutes internal debug logging, console traces, and telemetry error captures. |
| **Node.js (SSR and Edge)** | **Full Stealth**<br>Suppresses inspector network events and console dumps. | **Suppressed**<br>No stdout/stderr diagnostic leaking. |

---

## Response Caching and SWR

Multi-tier caching with in-memory LRU, persistent disk storage, Stale-While-Revalidate (SWR), and RFC 7234 conditional validation.

### 1. In-Memory LRU Cache

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    defaultTtl: 60000, // 60 seconds
    maxSize: 100,      // Maximum 100 items (LRU eviction)
  },
});

const r1 = await api.get('/products'); // Network fetch
const r2 = await api.get('/products'); // Instant cache hit (0ms)
console.log(r2.cached); // true

// Mutations automatically invalidate matching cached paths:
await api.post('/products', { name: 'New Item' });
```

### 2. Persistent Storage Adapter

Persist cached responses across application restarts using mobile storage adapters:

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
```

### 3. Stale-While-Revalidate (SWR)

Serve cached data immediately (`cached: true, stale: true`) while refreshing the resource from the network in the background:

```typescript
const res = await api.get('/dashboard/stats', {
  cache: {
    strategy: 'stale-while-revalidate',
    onRevalidated: (freshResponse) => {
      console.log('Background update received:', freshResponse.data);
    },
  },
});

console.log(res.stale); // true
```

### 4. RFC 7234 Conditional Validation (`ETag` and `304`)

When `etag: true` is configured, the client stores `ETag` and `Last-Modified` response headers and dispatches subsequent requests with `If-None-Match`. On receiving `304 Not Modified`, the cached body is returned with updated headers:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  cache: {
    enabled: true,
    etag: true,
  },
});
```

### 5. Declarative Cache Invalidation (`invalidate`)

Purge related cached resources upon successful mutations:

```typescript
await api.put('/users/42', { name: 'Alice' }, {
  cache: {
    invalidate: ['/users'], // Accepts route path strings or RegExp patterns
  },
});
```

---

## In-Flight Request Deduplication (`dedup`)

Coalesces identical concurrent `GET` requests into a single network flight:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  dedup: {
    enabled: true,
    methods: ['GET', 'HEAD'],
  },
});

// Three simultaneous calls trigger only one network request:
const [user1, user2, user3] = await Promise.all([
  api.get('/users/1'),
  api.get('/users/1'),
  api.get('/users/1'),
]);

console.log(user1.fromDedup); // false (dispatched the network flight)
console.log(user2.fromDedup); // true  (subscribed to in-flight request)
console.log(user3.fromDedup); // true  (subscribed to in-flight request)
```

---

## Authentication and Token Refresh Mutex (`auth`)

Synchronizes concurrent 401 Unauthorized responses through an asynchronous mutex, ensuring only one refresh request runs at a time:

```typescript
let currentAccessToken = 'initial_token';

const api = createClient({
  baseURL: 'https://api.example.com',
  bearerToken: () => currentAccessToken,
  auth: {
    refreshToken: async () => {
      const res = await fetch('https://api.example.com/oauth/refresh', { method: 'POST' });
      const data = await res.json();
      currentAccessToken = data.access_token;
      return currentAccessToken;
    },
    // Optional proactive refresh: refreshes token before dispatch if expired
    isExpired: () => Date.now() > tokenExpiresAt,
    refreshOn: [401],
    refreshExcludeUrls: ['/oauth/refresh', '/auth/login'],
    headerName: 'Authorization',
    tokenPrefix: 'Bearer ',
  },
});
```

---

## Resilient Retry Engine (`retry`)

Automatically retries transient network errors and 5xx responses using exponential backoff, full jitter, and `Retry-After` header parsing:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  retry: {
    attempts: 3,
    delay: 500,
    maxDelay: 10000,
    backoff: 'exponential',
    jitter: true,
    retryOn: [408, 429, 500, 502, 503, 504],
    respectRetryAfter: true,
  },
});
```

---

## Circuit Breaker (`circuitBreaker`)

Prevents cascading failures by halting outgoing requests locally when consecutive upstream failures exceed a threshold:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,   // Trip to OPEN after 5 consecutive failures
    resetTimeoutMs: 30000, // Probe in HALF_OPEN after 30 seconds
  },
});
```

---

## Client Concurrency Throttling (`maxConcurrentRequests`)

Caps the maximum number of simultaneous active sockets across the client instance:

```typescript
const api = createClient({
  baseURL: 'https://api.example.com',
  maxConcurrentRequests: 4, // Excess requests wait in FIFO queue
});
```

---

## Autocomplete Cancellation Groups (`cancelPrevious`)

Pass `cancelPrevious: '<groupKey>'` to automatically abort in-flight requests in the same group when a newer request starts:

```typescript
const searchResults = await api.get('/search', {
  params: { q: text },
  cancelPrevious: 'user-search',
});
```

Cancellation groups are scoped to each `HttpClient` instance.

---

## Streaming and Progress

### AI LLM and SSE Streaming (`api.stream`)

```typescript
const stream = api.stream('/chat/completions', {
  method: 'POST',
  body: { model: 'gpt-4o', stream: true, messages: [{ role: 'user', content: 'Hello' }] },
});

for await (const chunk of stream) {
  if (chunk.data === '[DONE]') break;
  const parsed = JSON.parse(chunk.data);
  process.stdout.write(parsed.choices[0]?.delta?.content ?? '');
}
```

### File Uploads with Progress (`api.upload`)

```typescript
const response = await api.upload('/media/upload', fileBlob, {
  fieldName: 'file',
  fileName: 'photo.jpg',
  additionalFields: { userId: '42' },
  onUploadProgress: (progress) => {
    console.log(`Upload: ${progress.percent}% (${progress.loaded}/${progress.total})`);
  },
});
```

---

## Auto-Pagination (`api.paginate`)

Traverse multi-page APIs with async generators or collect all pages into an array:

```typescript
// 1. Iterate items individually
for await (const user of api.paginate<User>('/users', {
  pagination: { type: 'page', pageParam: 'page', pageSize: 20 },
})) {
  console.log(user.name);
}

// 2. Collect all pages into an array
const allPosts = await api.paginate.all<Post>('/posts', {
  pagination: { type: 'page', pageParam: '_page', limitParam: '_limit', limit: 10 },
});
```

Supports `page`, `offset`, `cursor`, and RFC 5988/8288 standard `Link` headers.

---

## Testing Mock Adapter (`createMockAdapter`)

Declarative unit testing for network requests with zero external dependencies:

```typescript
import { createClient, createMockAdapter } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });
const mock = createMockAdapter(api);

mock.onGet('/users/active').reply(200, [{ id: 1, name: 'Alice' }]);
mock.onPost('/billing/charge').replyWithTimeout();

const res = await api.get('/users/active');
expect(res.data).toEqual([{ id: 1, name: 'Alice' }]);
expect(mock.history.get).toHaveLength(1);

mock.restore();
```

---

## Offline Request Queue (`createOfflineQueue`)

Queue mutations while offline and replay them sequentially with persistent UUID idempotency headers:

```typescript
import { createClient, createOfflineQueue, MemoryStorageAdapter } from 'react-native-fetch-client';

const api = createClient({ baseURL: 'https://api.example.com' });

const queue = createOfflineQueue({
  client: api,
  storage: new MemoryStorageAdapter(), // Or MMKV / AsyncStorage adapter
  maxQueueSize: 100,
  maxAttempts: 5,
  idempotencyHeader: 'Idempotency-Key',
  onReplaySuccess: (req) => console.log(`Synced: ${req.method} ${req.url}`),
});

await queue.enqueue({
  url: '/notes',
  method: 'POST',
  body: { title: 'Drafted offline' },
});

const summary = await queue.process();
console.log(`Replayed: ${summary.succeeded} succeeded, ${summary.remaining} remaining.`);
```

---

## Configuration Reference

### ClientConfig

Options passed to `createClient(config)`:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseURL` / `baseUrl` | `string` | `undefined` | Base URL prepended to relative request URLs. |
| `headers` | `HeadersInit` | `undefined` | Default HTTP headers included with all requests. |
| `params` | `QueryParams` | `undefined` | Default query parameters merged into all requests. |
| `timeout` | `number` | `0` | Default timeout in milliseconds (0 = no timeout). |
| `responseType` | `ResponseType` | `'json'` | Default response parsing (`'json'`, `'text'`, `'blob'`, `'arrayBuffer'`, `'stream'`). |
| `credentials` | `RequestCredentials` | `undefined` | Credentials mode (`'omit'`, `'same-origin'`, `'include'`). |
| `redirect` | `RequestRedirect` | `undefined` | Redirect handling (`'follow'`, `'manual'`, `'error'`). |
| `bearerToken` | `string \| (() => string \| Promise<string>)` | `undefined` | Static token or dynamic getter for `Authorization: Bearer <token>`. |
| `auth` | `AuthConfig` | `undefined` | Token refresh mutex and authentication configuration. |
| `cache` | `CacheConfig \| boolean` | `undefined` | Caching configuration (LRU, TTL, SWR, storage adapter). |
| `dedup` | `DedupConfig \| boolean` | `undefined` | In-flight request deduplication configuration. |
| `retry` | `Partial<RetryPolicy> \| false` | `undefined` | Retry engine configuration (attempts, backoff, jitter, status codes). |
| `circuitBreaker` | `CircuitBreakerConfig \| boolean` | `undefined` | Circuit breaker failure threshold and reset timeout configuration. |
| `maxConcurrentRequests` | `number` | `0` | Maximum simultaneous active requests (0 = unlimited). |
| `hideFromDevTools` | `DevToolsPrivacyFilter` | `false` | Universal DevTools stealth mode filter (`true`, `string[]`, `RegExp[]`). |
| `unwrap` | `boolean` | `false` | When true, returns `response.data` directly instead of `HttpResponse<T>`. |
| `debug` | `boolean \| DebugLogger` | `false` | Enable console debug logging or provide a custom logger callback. |
| `fetchImpl` | `FetchImpl` | `globalThis.fetch` | Custom Fetch transport implementation. |
| `dispatcher` | `unknown` | `undefined` | Custom dispatcher (e.g. Undici ProxyAgent in Node.js). |

### RequestConfig

Options passed to individual request calls (overrides client defaults):

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `url` | `string` | `''` | Request path or absolute URL. |
| `method` | `HttpMethod` | `'GET'` | HTTP method. |
| `headers` | `HeadersInit` | `undefined` | Request-specific HTTP headers. |
| `params` | `QueryParams` | `undefined` | Query parameters serialized onto the URL. |
| `pathParams` | `PathParams` | `undefined` | Path parameter interpolation mapping (e.g. `{ id: 42 }`). |
| `body` | `unknown` | `undefined` | Request body payload. Objects are serialized to JSON by default. |
| `timeout` | `number` | Inherited | Request timeout in milliseconds. |
| `signal` | `AbortSignal` | `undefined` | WHATWG AbortSignal for request cancellation. |
| `cancelPrevious` | `string` | `undefined` | Cancellation group key. Aborts prior in-flight requests sharing the key. |
| `schema` | `SchemaValidator<T>` | `undefined` | Standard Schema v1 validator (Zod, Valibot, ArkType) for response verification. |
| `formUrlEncoded` | `boolean` | `false` | Serializes body as `application/x-www-form-urlencoded`. |
| `cache` | `RequestCacheConfig \| boolean` | Inherited | Per-request cache configuration, invalidation targets, or SWR callbacks. |
| `dedup` | `boolean` | Inherited | Enable or disable in-flight deduplication for this request. |
| `retry` | `Partial<RetryPolicy> \| false` | Inherited | Per-request retry policy override. |
| `circuitBreaker` | `CircuitBreakerConfig \| boolean` | Inherited | Per-request circuit breaker override. |
| `hideFromDevTools` | `DevToolsPrivacyFilter` | Inherited | Override DevTools stealth suppression for this request. |
| `unwrap` | `boolean` | Inherited | Override response unwrapping for this request. |
| `onDownloadProgress` | `(event: ProgressEvent) => void` | `undefined` | Real-time download progress callback. |
| `onUploadProgress` | `(event: ProgressEvent) => void` | `undefined` | Real-time upload progress callback. |

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
  isCircuitBreakerError,
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
  } else if (isCircuitBreakerError(err)) {
    console.log(`Circuit is open in state: ${err.state}`);
  } else if (isWaitForAbortedError(err)) {
    console.log('Wait was terminated by stopIf:', err.response.data);
  }
}
```

---

## Migration from Axios

| Axios | react-native-fetch-client | Notes |
| :--- | :--- | :--- |
| `import axios from 'axios'` | `import client from 'react-native-fetch-client'` | Ready-to-use default instance |
| `axios.get(url, config)` | `client.get(url, config)` | Identical |
| `axios.post(url, data, config)` | `client.post(url, data, config)` | Identical |
| `axios.delete(url, config)` | `client.delete(url)` or `client.del(url)` | Identical + `.del()` shorthand |
| `axios.create({ baseURL })` | `createClient({ baseURL })` | Supports both `baseURL` and `baseUrl` |
| `res.data` | `res.data` | Identical |
| `axios.interceptors.request.use()` | `client.interceptors.request.use()` | Identical |
| `axios.isAxiosError(err)` | `isHttpError(err)` or `isFetchNativeError(err)` | Type-safe error guards |
| `axios-retry` (plugin) | `createClient({ retry: {...} })` | Built-in |
| `axios-cache-interceptor` (plugin) | `createClient({ cache: {...} })` | Built-in |
| `axios-mock-adapter` (package) | `createMockAdapter(client)` | Built-in |

---

## Security

For vulnerability disclosure and security guidance, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) &copy; 2026 Arunkumar Arjunan
