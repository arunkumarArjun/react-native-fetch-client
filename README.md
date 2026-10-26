# react-native-fetch-client

A lightweight, Fetch-native HTTP client for TypeScript and JavaScript across React Native, Expo, web browsers, and Node.js.

[![npm version](https://img.shields.io/npm/v/react-native-fetch-client.svg)](https://www.npmjs.com/package/react-native-fetch-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml/badge.svg)](https://github.com/arunkumarArjun/react-native-fetch-client/actions/workflows/ci.yml)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Coverage](https://img.shields.io/badge/tests-270%20passed-brightgreen.svg)](test)

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

## Built-in Capabilities (Out of the Box)

In traditional HTTP setups, achieving production resilience requires installing, maintaining, and stitching together 5 to 7 separate packages. `react-native-fetch-client` provides these capabilities natively in a modular, zero-dependency package:

| Capability | What It Solves |
| :--- | :--- |
| **Single-Flight 401 Auth Mutex** | Queues concurrent requests behind an asynchronous lock when access tokens expire. Exactly 1 refresh call executes; pending requests replay automatically with the new token. |
| **In-Flight Request Deduplication** | Coalesces identical concurrent `GET` requests into a single network flight, eliminating duplicate requests when multiple UI components mount simultaneously. |
| **Async Webhook & Resource Waiter** | Dedicated `api.waitFor()` method for polling payment settlement (3DS, Apple Pay, UPI), KYC verification, or background jobs with error suppression, backoff caps, and abort criteria. |
| **Response Caching & SWR** | Dual-tier caching: in-memory LRU, persistent storage adapters (MMKV / AsyncStorage), RFC 7234 conditional validation (ETag / 304), and Stale-While-Revalidate (SWR) background revalidation. |
| **Automatic Cache Invalidation** | Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) automatically purge matching cached paths, with support for declarative route and RegExp pattern invalidation. |
| **Resilient Retry Engine** | Configurable exponential backoff retries with full jitter, server `Retry-After` adherence, and custom retry predicates. |
| **Client Concurrency Throttling** | FIFO queue caps maximum simultaneous active sockets (`maxConcurrentRequests`) to prevent mobile connection bottlenecks. |
| **Search Autocomplete Auto-Cancel** | `cancelPrevious: '<groupKey>'` automatically aborts superseded search queries as the user types, preventing out-of-order race conditions. |
| **Native AI & SSE Streaming** | Consume Server-Sent Events (SSE) and AI LLM token streams (OpenAI, Anthropic, Gemini, Ollama) directly via async generators (`api.stream`). |
| **Go/Rust-Style Safe Requests** | `api.safe.*` returns typed `[data, error]` tuples, eliminating nested `try/catch` boilerplate. |
| **Standard Schema v1 Validation** | Built-in runtime response validation supporting Zod, Valibot, ArkType, and functional schemas with compile-time type inference. |
| **Auto-Pagination Helper** | Traversing paginated endpoints (`api.paginate`) across page-number, offset-limit, cursor-based, and RFC 5988/8288 `Link` header APIs. |
| **Declarative Mock Adapter (`.../mock`)** | Modular testing adapter (`react-native-fetch-client/mock`) for unit testing network logic, stubbing routes, and asserting call history with 0 KB production bundle impact. |
| **Offline Mutation Queue (`.../offline`)** | Modular offline queue (`react-native-fetch-client/offline`) that replays requests sequentially with persistent UUID idempotency headers upon reconnection. |

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
  bearerToken: async () => await SecureStore.getItemAsync('access_token'),
  auth: {
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

`react-native-fetch-client` is an ideal fetcher for TanStack Query. Pass `unwrap: true` to return the response payload directly:

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

interface UserProfile {
  id: string;
  name: string;
}

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<UserProfile>(`/users/${userId}`, { unwrap: true }),
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
    ignoreErrors: [404],                           // Tolerates 404 while backend webhook writes record
    interval: 1000,
    backoff: 1.5,
    maxInterval: 5000,                             // Backoff ceiling cap
    timeout: 45000,                                // Total timeout deadline
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
  additionalFields: { folderId: 'inbox' },
  onUploadProgress: (progress) => {
    if (progress.lengthComputable && progress.percent !== undefined) {
      console.log(`Upload: ${progress.percent}% (${progress.loaded} / ${progress.total} bytes)`);
    }
  },
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
| `maxConcurrentRequests` | `number` | `0` | Maximum simultaneous active requests (0 = unlimited). |
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

## Security

For vulnerability disclosure and security guidance, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## License

[MIT](LICENSE) &copy; 2026 Arunkumar Arjunan
