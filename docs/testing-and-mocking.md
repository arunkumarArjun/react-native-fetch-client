# Testing and Mock Adapter Guide

This guide demonstrates how to unit-test network calls and API integration code using **`createMockAdapter`** — built-in with zero external dependencies (no need for `axios-mock-adapter`, `msw`, or manual `globalThis.fetch` mocking).

---

## 1. Overview and Setup

`createMockAdapter` attaches directly to your `HttpClient` instance, intercepting matching routes, recording request history, and responding with mock fixtures or errors:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from 'react-native-fetch-client';
import { createMockAdapter, type MockAdapter } from 'react-native-fetch-client/mock';

describe('UserService Unit Tests', () => {
  const api = createClient({ baseURL: 'https://api.example.com' });
  let mock: MockAdapter;

  beforeEach(() => {
    mock = createMockAdapter(api);
  });

  afterEach(() => {
    // Restore original client fetch transport after each test
    mock.restore();
  });

  it('fetches users successfully', async () => {
    // Register mock route
    mock.onGet('/users').reply(200, [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    const res = await api.get('/users');

    expect(res.status).toBe(200);
    expect(res.data).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
    expect(mock.history.get).toHaveLength(1);
  });
});
```

---

## 2. Route Matching

### Exact String Match
```typescript
mock.onGet('/profile').reply(200, { username: 'testuser' });
mock.onPost('/auth/login').reply(200, { token: 'mock_jwt_123' });
```

### Regular Expression Match
Match dynamic path parameters or varying queries:
```typescript
// Matches /users/1, /users/999, etc.
mock.onGet(/\/users\/\d+/).reply(200, { id: 1, name: 'Matched User' });
```

### Method Catch-All (`onAny`)
```typescript
mock.onAny('/health').reply(200, { status: 'healthy' });
```

---

## 3. Response Actions

### 1. Static Reply
```typescript
mock.onGet('/settings').reply(200, { theme: 'dark' }, { 'x-mocked': 'true' });
```

### 2. Dynamic Callback Reply
Inspect request headers, URL parameters, or request payload before returning a dynamic response:
```typescript
mock.onPost('/items').reply((config) => {
  const body = JSON.parse(config.body as string);

  if (!body.name) {
    return [400, { error: 'Name is required' }];
  }

  return [201, { id: Date.now(), name: body.name }, { 'Content-Type': 'application/json' }];
});
```

### 3. Simulating Network Timeouts (`replyWithTimeout`)
Simulates a `TimeoutError` without waiting for real timer delays:
```typescript
mock.onGet('/slow-endpoint').replyWithTimeout();

await expect(api.get('/slow-endpoint')).rejects.toThrowError();
```

### 4. Simulating Network Disconnections (`replyWithNetworkError`)
Simulates an offline device or DNS failure (`NetworkError`):
```typescript
mock.onPost('/sync').replyWithNetworkError('Failed to connect to server');

await expect(api.post('/sync', {})).rejects.toThrowError(/Failed to connect/);
```

---

## 4. Request History and Assertions

`mock.history` captures full records of intercepted requests:

```typescript
mock.onPost('/orders').reply(201, { orderId: 101 });

await api.post('/orders', { itemId: 4, quantity: 2 }, {
  headers: { 'X-Tracking-Id': 'track_9988' },
});

// Assert against all requests:
expect(mock.history.all).toHaveLength(1);

// Assert against method-specific arrays:
const orderCall = mock.history.post[0]!;
expect(orderCall.url).toBe('/orders');
expect(orderCall.body).toEqual({ itemId: 4, quantity: 2 });
expect(orderCall.headers?.['x-tracking-id']).toBe('track_9988');
```

Available history collections:
- `mock.history.all`: Array of all calls across all HTTP methods.
- `mock.history.get`: GET calls.
- `mock.history.post`: POST calls.
- `mock.history.put`: PUT calls.
- `mock.history.patch`: PATCH calls.
- `mock.history.delete`: DELETE calls.
- `mock.history.head`: HEAD calls.
- `mock.history.options`: OPTIONS calls.

---

## 5. Lifecycle and Reset Controls

| Method | Behavior |
| :--- | :--- |
| `mock.resetHandlers()` | Clears all registered route rules while preserving request history. |
| `mock.resetHistory()` | Clears recorded call history while keeping registered routes intact. |
| `mock.reset()` | Clears both registered handlers and captured history. |
| `mock.restore()` | Detaches the mock adapter and restores the original Fetch transport on the client. |

```typescript
afterEach(() => {
  mock.restore();
});
```
