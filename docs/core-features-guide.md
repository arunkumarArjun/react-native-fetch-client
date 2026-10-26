# Core Features and Usage Guide

This guide covers client initialization, HTTP request dispatching, URL formatting, safe execution tuples, interceptors, polling, and error handling in **`react-native-fetch-client`**.

---

## Client Initialization

Create an instance with `createClient`:

```typescript
import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10_000,
  headers: {
    Accept: 'application/json',
    'X-Client-Platform': 'react-native',
  },
});
```

You can also import the default client directly:

```typescript
import client from 'react-native-fetch-client';

const res = await client.get('https://api.example.com/v1/health');
```

---

## HTTP Methods and Shorthands

All HTTP methods support TypeScript generics for compile-time payload typing:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// 1. GET
const resGet = await api.get<User[]>('/users', {
  params: { role: 'admin', active: true },
});
console.log(resGet.data); // User[]

// 2. POST
const resPost = await api.post<User>('/users', {
  name: 'Jane Doe',
  email: 'jane@example.com',
});

// 3. PUT
const resPut = await api.put<User>('/users/1', {
  name: 'Jane Smith',
  email: 'jane.smith@example.com',
});

// 4. PATCH
const resPatch = await api.patch<User>('/users/1', {
  name: 'Jane Q. Smith',
});

// 5. DELETE (aliases: api.delete and api.del)
await api.delete('/users/1');
await api.del('/users/1');

// 6. Generic request()
const custom = await api.request<User>({
  url: '/users/search',
  method: 'POST',
  body: { query: 'Jane' },
});
```

---

## Path Parameter Interpolation (`pathParams`)

Interpolates template parameters directly into the URL path:

```typescript
// Named token syntax (:id)
const res1 = await api.get('/organizations/:orgId/members/:memberId', {
  pathParams: {
    orgId: 'acme-corp',
    memberId: 42,
  },
});
// Resolves to: /organizations/acme-corp/members/42

// Bracket token syntax ({id})
const res2 = await api.get('/projects/{projectId}/tasks/{taskId}', {
  pathParams: {
    projectId: 'alpha',
    taskId: 99,
  },
});
// Resolves to: /projects/alpha/tasks/99
```

---

## Query Parameters and Serialization

Query parameters are serialized onto the URL string. Multiple values can be formatted according to API requirements:

```typescript
// Array formatting options: 'brackets' (default), 'indices', 'repeat', 'comma'
const res = await api.get('/articles', {
  params: { tags: ['react', 'native'] },
  paramsSerializer: { arrayFormat: 'comma' },
});
// Resolves to: /articles?tags=react,native
```

---

## Form URL-Encoded Serializer (`formUrlEncoded`)

Serializes plain JavaScript objects to `application/x-www-form-urlencoded` payloads and sets the matching `Content-Type` header:

```typescript
const response = await api.post('/oauth/token', {
  grant_type: 'password',
  username: 'user@example.com',
  password: 'secretPassword',
  scope: 'read write',
}, {
  formUrlEncoded: true,
});
```

---

## Safe Requests (`api.safe.*`)

Returns a `[data, error]` tuple instead of throwing on rejection, avoiding nested `try/catch` blocks:

```typescript
// Safe GET
const [users, err] = await api.safe.get<User[]>('/users');

if (err) {
  console.error(`Failed to fetch users: ${err.message}`);
  if (err.isHttpError) {
    console.error(`Status code: ${err.status}`);
  }
  return;
}

console.log(users.length);

// Safe POST
const [newUser, postErr] = await api.safe.post<User>('/users', { name: 'Alice' });
if (postErr) {
  return;
}
console.log(newUser.id);
```

---

## Response Unwrapping (`unwrap: true`)

By default, calls return an `HttpResponse<T>` object containing status, headers, and metadata. To receive `response.data` directly, set `unwrap: true`:

```typescript
// Client-level default:
const client = createClient({
  baseURL: 'https://api.example.com',
  unwrap: true,
});

// Returns User[] directly:
const users = await client.get<User[]>('/users');

// Or per-request override:
const response = await api.get<User[]>('/users', { unwrap: false });
console.log(response.status); // 200
```

---

## Interceptors

Interceptors inspect, modify, or cancel requests before dispatch and process responses before return:

### Request Interceptor
```typescript
const reqInterceptorId = api.interceptors.request.use(async (config) => {
  const token = await getSecureStorageItem('authToken');
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// Remove when no longer needed
api.interceptors.request.eject(reqInterceptorId);
```

### Response Interceptor
```typescript
const respInterceptorId = api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('Request failed:', error);
    return Promise.reject(error);
  }
);
```

---

## Timeout and Abort Cancellation

```typescript
// Millisecond timeout (throws TimeoutError)
try {
  await api.get('/slow-report', { timeout: 3000 });
} catch (error) {
  if (isTimeoutError(error)) {
    console.warn('Request timed out after 3000ms');
  }
}

// Manual AbortController (throws CancelError)
const controller = new AbortController();

setTimeout(() => {
  controller.abort();
}, 500);

try {
  await api.get('/large-dataset', { signal: controller.signal });
} catch (error) {
  if (isCancelError(error)) {
    console.info('Request was cancelled');
  }
}
```

---

## Search Autocomplete Auto-Cancel (`cancelPrevious`)

Pass `cancelPrevious: '<groupKey>'` to automatically cancel pending requests in the group whenever a newer query starts:

```typescript
const searchUsers = async (query: string) => {
  try {
    const res = await api.get('/users/search', {
      params: { q: query },
      cancelPrevious: 'user-search',
    });
    return res.data;
  } catch (err) {
    if (isCancelError(err)) {
      // Safely ignore superseded queries
      return null;
    }
    throw err;
  }
};
```

Cancellation groups are scoped to each `HttpClient` instance.

---

## Polling Helper (`api.poll`)

Queries an endpoint until an `until` predicate returns true:

```typescript
interface ExportJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  downloadUrl?: string;
}

const job = await api.poll<ExportJob>('/reports/jobs/export-881', {
  interval: 1000,
  timeout: 45_000,
  backoff: 1.25,
  until: (res) => res.data.status === 'COMPLETED' || res.data.status === 'FAILED',
});

if (job.data.status === 'COMPLETED') {
  console.log('Download ready:', job.data.downloadUrl);
}
```

---

## Async Webhook and Resource Waiter (`api.waitFor`)

Polls endpoints until a terminal condition is met with exponential backoff, maximum interval caps, attempt limits, and error status suppression (e.g. ignoring `404 Not Found` while a background job provisioner completes):

```typescript
interface ProvisioningStatus {
  id: string;
  status: 'PENDING' | 'READY' | 'TERMINATED';
  endpoint?: string;
}

const res = await api.waitFor<ProvisioningStatus>('/clusters/node-442/status', {
  interval: 1000,
  maxInterval: 5000,
  backoff: 1.5,
  timeout: 60_000,
  maxAttempts: 20,
  ignoreErrors: [404],
  stopIf: (res) => res.data.status === 'TERMINATED',
  onTick: ({ attempt, elapsedMs }) => {
    console.log(`Waiting attempt ${attempt} (${elapsedMs}ms elapsed)...`);
  },
  until: (res) => res.data.status === 'READY',
});

console.log('Cluster ready at:', res.data.endpoint);
```

### Option Reference for `api.waitFor`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `until` | `(res: HttpResponse<T>) => boolean \| Promise<boolean>` | **Required** | Predicate returning true when the target state is reached. |
| `interval` | `number` | `1000` | Initial delay between polling attempts in milliseconds (minimum 50ms). |
| `maxInterval` | `number` | `10000` | Maximum ceiling cap for interval delay when using exponential backoff. |
| `backoff` | `number` | `1` | Multiplier applied to interval after each attempt (e.g. `1.5`). |
| `timeout` | `number` | `30000` | Total overall timeout in milliseconds. Aborts active requests on expiry. |
| `maxAttempts` | `number` | `Infinity` | Maximum number of attempts allowed before throwing `TimeoutError`. |
| `ignoreErrors` | `number[] \| boolean` | `[404]` | HTTP status codes to treat as pending and continue polling instead of throwing. |
| `stopIf` | `(res: HttpResponse<T>) => boolean \| Promise<boolean>` | `undefined` | Early termination predicate. Throws `WaitForAbortedError` if true. |
| `onTick` | `(info: { attempt, elapsedMs, response? }) => void` | `undefined` | Callback invoked after each attempt with iteration progress. |

---

## Request Latency Metrics (`response.durationMs`)

Every `HttpResponse` includes `durationMs` measuring roundtrip latency in milliseconds across network calls, cache hits, and 304 conditional validations:

```typescript
const res = await api.get('/dashboard/analytics');

console.log(`Latency: ${res.durationMs}ms`);
console.log(`From cache: ${res.cached}`);
```

---

## Error Hierarchy and Type Guards

All errors inherit from `FetchNativeError` and include discriminator codes and type guards:

```typescript
import {
  isHttpError,
  isTimeoutError,
  isCancelError,
  isNetworkError,
  isValidationError,
  isAuthRefreshError,
  isWaitForAbortedError,
} from 'react-native-fetch-client';

try {
  await api.get('/profile');
} catch (err) {
  if (isHttpError(err)) {
    console.log(`HTTP ${err.status}: ${err.statusText}`);
    console.log('Error payload:', err.data);
  } else if (isTimeoutError(err)) {
    console.log(`Timed out after ${err.timeoutMs}ms`);
  } else if (isCancelError(err)) {
    console.log('Cancelled');
  } else if (isNetworkError(err)) {
    console.log('Network unreachable');
  } else if (isValidationError(err)) {
    console.log('Schema validation failed:', err.issues);
  } else if (isAuthRefreshError(err)) {
    console.log('Token refresh failed:', err.cause);
  } else if (isWaitForAbortedError(err)) {
    console.log('Wait aborted by stopIf condition:', err.response.data);
  }
}
```

---

## Diagnostic Debug Logger (`debug`)

Enable structured logging for inspecting network activity:

```typescript
// Boolean (logs to console)
const api = createClient({
  baseURL: 'https://api.example.com',
  debug: true,
});

// Custom logger callback
const customApi = createClient({
  baseURL: 'https://api.example.com',
  debug: (entry) => {
    console.log(`${entry.method} ${entry.url} -> ${entry.status} (${entry.durationMs}ms)`);
  },
});
```
