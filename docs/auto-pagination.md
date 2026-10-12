# Auto-Pagination Helper

This guide explains how to traverse and consume paginated REST APIs using **`react-native-fetch-client`**'s built-in `api.paginate` helper.

---

## 🚀 Overview

Traversing multi-page APIs typically involves repetitive `while` loops, tracking offsets, parsing page counts, and accumulating arrays. 

`api.paginate` provides a unified, type-safe interface supporting **4 pagination models** across **3 consumption patterns**:

```typescript
// 1. Stream items individually (Memory efficient!)
for await (const user of api.paginate<User>('/users')) {
  console.log(user.name);
}

// 2. Stream full page response envelopes
for await (const page of api.paginate.pages<User[]>('/users')) {
  console.log(`Page status: ${page.status}, count: ${page.data.length}`);
}

// 3. Accumulate all items across all pages into a flat array
const allUsers = await api.paginate.all<User>('/users');
console.log(`Total collected: ${allUsers.length}`);
```

---

## 🛠️ The 4 Traversal Strategies

### Strategy 1: Page-Number Pagination (`type: 'page'`)
Increments page number query parameters (`?page=1`, `?page=2`, etc.):

```typescript
interface Post {
  id: number;
  title: string;
}

const posts = await api.paginate.all<Post>('/posts', {
  pagination: {
    type: 'page',
    pageParam: '_page',     // Default: 'page'
    pageSizeParam: '_limit', // Default: 'limit'
    pageSize: 20,           // Items per page
    initialPage: 1,         // Default: 1
    maxPages: 5,            // Safety cap: fetch max 5 pages
  },
});
```

### Strategy 2: Offset & Limit Pagination (`type: 'offset'`)
Increments the offset parameter by `pageSize` (`?offset=0`, `?offset=25`, `?offset=50`):

```typescript
const products = await api.paginate.all<Product>('/products', {
  pagination: {
    type: 'offset',
    offsetParam: 'skip',     // Default: 'offset'
    pageSizeParam: 'take',   // Default: 'limit'
    pageSize: 25,
    initialOffset: 0,        // Default: 0
    maxPages: 10,
  },
});
```

### Strategy 3: Cursor-Based Pagination (`type: 'cursor'`)
Passes a continuation cursor token to fetch the next page. Often used by Slack, Stripe, GitHub, and Twitter APIs:

```typescript
interface MessageResponse {
  messages: Array<{ id: string; text: string }>;
  nextCursor?: string | null;
}

for await (const message of api.paginate<Message, MessageResponse>('/channels/general/messages', {
  pagination: {
    type: 'cursor',
    cursorParam: 'cursor',
    initialCursor: undefined,
    // Extract cursor token from response envelope:
    getNextCursor: (res) => res.data.nextCursor,
    // Extract items array from wrapper object:
    getItems: (data) => data.messages,
  },
})) {
  console.log(`[${message.id}] ${message.text}`);
}
```

### Strategy 4: RFC 5988 / 8288 `Link` Header Pagination (`type: 'linkHeader'`)
Standard used by GitHub REST API and compliant web servers (`Link: <https://api.github.com/user/repos?page=2>; rel="next"`):

```typescript
const repos = await api.paginate.all<Repo>('/user/repos', {
  pagination: {
    type: 'linkHeader',
    maxPages: 10,
  },
});
```

The client automatically invokes `parseNextLinkHeader()` to extract the exact URL provided in the `rel="next"` segment.

---

## 🎯 Custom Extraction Functions

When dealing with non-standard API response envelopes:

```typescript
interface ApiResponse<T> {
  result: {
    records: T[];
    paginationInfo: {
      nextHref?: string;
    };
  };
}

const items = await api.paginate.all<Item, ApiResponse<Item>>('/catalog', {
  pagination: {
    // Extract array from nested payload:
    getItems: (payload) => payload.result.records,

    // Extract next URL directly:
    getNextUrl: (response) => response.data.result.paginationInfo.nextHref,
  },
});
```

---

## 🛡️ Termination & Infinite Loop Prevention

Pagination automatically halts when any of the following conditions are met:
1. The server returns an **empty array** (`[]` or zero items extracted).
2. The extracted page contains **fewer items** than `pageSize`.
3. `getNextCursor` or `getNextUrl` returns `null` or `undefined`.
4. The number of fetched pages reaches `maxPages` (Default: `50` to safeguard mobile devices against unintentional infinite loops).

