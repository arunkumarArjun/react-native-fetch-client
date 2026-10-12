# Core Features & Usage Guide

This guide covers the core ergonomics, request dispatching, URL formatting, safe execution, and interceptor patterns available in **`react-native-fetch-client`**.

---

## 🛠️ Client Initialization

Create a customized client instance with `createClient`:

```typescript
import { createClient } from 'react-native-fetch-client';

const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10_000, // 10 seconds timeout
  headers: {
    'Accept': 'application/json',
    'X-Client-Platform': 'react-native',
  },
});
```

---

## 📡 HTTP Methods & Shorthands

All HTTP methods support full TypeScript generics for compile-time payload typing:

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

// 5. DELETE
await api.delete('/users/1');

// 6. Generic request()
const custom = await api.request<User>({
  url: '/users/search',
  method: 'POST',
  body: { query: 'Jane' },
});
```

---

## 🧩 Path Parameter Interpolation (`pathParams`)

Eliminate manual string concatenation or template literal bugs when constructing dynamic URLs:

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

## 🔍 Query Parameters & Array Serialization

Configure how arrays and nested objects are serialized in URL query strings:

```typescript
// 1. Array Format: 'brackets' (Default) -> ?tags[]=react&tags[]=native
const resBrackets = await api.get('/articles', {
  params: { tags: ['react', 'native'] },
  paramsSerializer: { arrayFormat: 'brackets' },
});

// 2. Array Format: 'indices' -> ?tags[0]=react&tags[1]=native
const resIndices = await api.get('/articles', {
  params: { tags: ['react', 'native'] },
  paramsSerializer: { arrayFormat: 'indices' },
});

// 3. Array Format: 'repeat' -> ?tags=react&tags=native
const resRepeat = await api.get('/articles', {
  params: { tags: ['react', 'native'] },
  paramsSerializer: { arrayFormat: 'repeat' },
});

// 4. Array Format: 'comma' -> ?tags=react,native
const resComma = await api.get('/articles', {
  params: { tags: ['react', 'native'] },
  paramsSerializer: { arrayFormat: 'comma' },
});
```

---

## 📑 Form URL-Encoded Serializer (`formUrlEncoded`)

Serializes plain JavaScript objects to `application/x-www-form-urlencoded` payloads and automatically injects the matching `Content-Type` header:

```typescript
const response = await api.post('/oauth/token', {
  grant_type: 'password',
  username: 'user@example.com',
  password: 'secretPassword',
  scope: 'read write',
}, {
  formUrlEncoded: true,
});
// Payload is serialized as:
// grant_type=password&username=user%40example.com&password=secretPassword&scope=read+write
```

---

## 🛡️ Go / Rust Safe Requests (`api.safe.*`)

Avoid nested `try/catch` boilerplate and unhandled promise rejections. Returns a `[data, error]` tuple where exactly one value is populated:

```typescript
// 1. Safe GET
const [users, err] = await api.safe.get<User[]>('/users');

if (err) {
  console.error(`Failed to fetch users: ${err.message}`);
  if (err.isHttpError) {
    console.error(`Status code: ${err.status}`);
  }
  return;
}

// Guaranteed non-null and fully typed!
console.log(users.length);

// 2. Safe POST
const [newUser, postErr] = await api.safe.post<User>('/users', { name: 'Alice' });
if (postErr) {
  // Handle error cleanly
  return;
}
console.log(newUser.id);
```

---

## 🎁 Response Unwrapping (`unwrap: true`)

By default, calls return the full `HttpResponse<T>` envelope containing metadata (`status`, `headers`, `cached`, `stale`). To receive `response.data` directly, set `unwrap: true`:

```typescript
// Client-level default:
const client = createClient({
  baseURL: 'https://api.example.com',
  unwrap: true,
});

// Returns User[] directly instead of HttpResponse<User[]>:
const users = await client.get<User[]>('/users');

// Or per-request override:
const response = await api.get<User[]>('/users', { unwrap: false });
console.log(response.status); // 200
```

---

## 🔌 Interceptors

Interceptors allow inspecting, transforming, or intercepting requests before dispatch and responses before return:

### Request Interceptor
```typescript
// Attach token or custom headers dynamically
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

// Eject interceptor when no longer needed
api.interceptors.request.eject(reqInterceptorId);
```

### Response Interceptor
```typescript
// Transform responses or log telemetry globally
const respInterceptorId = api.interceptors.response.use(
  (response) => {
    console.log(`[HTTP ${response.status}] ${response.config.url} in ${response.config.method}`);
    return response;
  },
  (error) => {
    // Global error capture (e.g. Sentry)
    console.error(`Request failed:`, error);
    return Promise.reject(error);
  }
);
```

---

## ⏱️ Timeout & Abort Cancellation

```typescript
// 1. Millisecond timeout (throws TimeoutError)
try {
  await api.get('/slow-report', { timeout: 3000 });
} catch (error) {
  if (isTimeoutError(error)) {
    console.warn(`Request timed out after 3000ms`);
  }
}

// 2. Manual AbortController (throws CancelError)
const controller = new AbortController();

setTimeout(() => {
  controller.abort(); // Cancel request after 500ms
}, 500);

try {
  await api.get('/large-dataset', { signal: controller.signal });
} catch (error) {
  if (isCancelError(error)) {
    console.info(`Request was cancelled by user action`);
  }
}
```

---

## 🚨 Error Hierarchy & Type Guards

All errors thrown inherit from `FetchNativeError` and provide helper type guards:

```typescript
import {
  isHttpError,
  isTimeoutError,
  isCancelError,
  isNetworkError,
  isValidationError,
  isCircuitBreakerError,
} from 'react-native-fetch-client';

try {
  await api.get('/profile');
} catch (err) {
  if (isHttpError(err)) {
    // 4xx or 5xx HTTP response
    console.log(err.status); // 404
    console.log(err.data);   // Server error JSON payload
  } else if (isTimeoutError(err)) {
    console.log(`Timeout: ${err.timeoutMs}ms exceeded`);
  } else if (isCancelError(err)) {
    console.log('User cancelled request');
  } else if (isNetworkError(err)) {
    console.log('Device is offline or socket refused');
  } else if (isValidationError(err)) {
    console.log('Schema validation failed:', err.issues);
  } else if (isCircuitBreakerError(err)) {
    console.log(`Circuit is open for host: ${err.host}`);
  }
}
```

---

## 📊 Diagnostic Debug Logger (`debug`)

Enable detailed logging for debugging network flows:

```typescript
// Simple boolean (logs to console)
const api = createClient({
  baseURL: 'https://api.example.com',
  debug: true,
});

// Custom logger callback
const customApi = createClient({
  baseURL: 'https://api.example.com',
  debug: (entry) => {
    console.log(`[NET] ${entry.method} ${entry.url} => ${entry.status} (${entry.durationMs}ms, cached: ${entry.cached})`);
  },
});
```

