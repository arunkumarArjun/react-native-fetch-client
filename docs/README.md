# react-native-fetch-client — Developer Documentation

Welcome to the comprehensive developer documentation for **`react-native-fetch-client`**, an enterprise-grade, Fetch-native HTTP engine engineered for **React Native, Expo, modern web browsers, Node.js 18+, and edge runtimes**.

---

## 🧭 Documentation Index

| Guide | Description |
| :--- | :--- |
| **[1. Architecture & Execution Flow](./architecture-flow.md)** | Comprehensive step-by-step trace of how requests move through the 16-stage pipeline. |
| **[2. Core Features & Usage Guide](./core-features-guide.md)** | Client initialization, HTTP methods, path params, form encoding, safe requests, polling, search auto-cancel, and latency tracking. |
| **[3. Caching & Stale-While-Revalidate](./caching-and-swr.md)** | In-memory LRU, persistent storage adapters (MMKV / AsyncStorage), ETag / 304, declarative invalidation, and SWR strategy. |
| **[4. Resilience, Retries & Offline Queue](./resilience-and-offline.md)** | Exponential backoff, jitter, circuit breaker, concurrency limiter, request dedup, and offline replay queue. |
| **[5. Streaming, AI & File Uploads](./streaming-and-uploads.md)** | SSE / AI LLM token streams, WHATWG streams, file uploads, and upload/download progress metrics. |
| **[6. Authentication & Security](./auth-and-security.md)** | Bearer presets, single-flight 401 refresh mutex, proactive token expiry, token rotation, and header redaction. |
| **[7. Auto-Pagination Helper](./auto-pagination.md)** | Stream and collect paginated APIs (`page`, `offset`, `cursor`, RFC 5988/8288 `Link` headers). |
| **[8. Testing & Mock Adapter](./testing-and-mocking.md)** | Zero-dependency declarative test mocking (`createMockAdapter`), route stubbing, error simulations, and history inspection. |

---

## 🏛️ High-Level System Architecture

`react-native-fetch-client` is designed around an execution pipeline where each concern (caching, deduplication, concurrency, circuit breaking, authentication) is decoupled into standalone modules that orchestrate seamlessly:

```mermaid
flowchart TD
    App["Application Call<br/>(api.get / api.safe.post / api.paginate)"] --> Normalizer["1. URL & Config Normalizer<br/>(Path params, query formatting, headers)"]
    Normalizer --> Concurrency["2. Concurrency Limiter<br/>(FIFO Queue if maxConcurrentRequests set)"]
    Concurrency --> ReqInterceptors["3. Request Interceptors<br/>(inspect, modify, or transform config)"]
    ReqInterceptors --> AuthBearer["4. Bearer Token Provider<br/>(Injects static/dynamic Authorization)"]
    AuthBearer --> CircuitBreaker["5. Circuit Breaker Inspection<br/>(Fails early if state is OPEN)"]
    CircuitBreaker --> CacheCheck{"6. Cache Check & SWR"}
    
    CacheCheck -- "Fresh Hit" --> ReturnCache["Return Cached Response (0ms)"]
    CacheCheck -- "Stale Hit (SWR)" --> ServeStale["Return Stale (0ms)<br/>+ Quiet Background Revalidation"]
    CacheCheck -- "Miss / Stale / Force" --> DedupCheck{"7. In-Flight Dedup"}

    DedupCheck -- "Duplicate In-Flight" --> DedupAttach["Attach to Existing Promise<br/>(fromDedup = true)"]
    DedupCheck -- "New Request" --> RetryLoop["8. Retry Engine Loop<br/>(Backoff, Jitter, Retry-After)"]

    RetryLoop --> Transport["9. WHATWG Fetch Transport<br/>(Network round-trip, timeout, cancel)"]
    Transport --> Auth401{"10. Status 401 & Auth Handler?"}

    Auth401 -- "Yes (401)" --> SingleFlightRefresh["11. Single-Flight Token Refresh Mutex<br/>(Wait for new token & replay)"]
    SingleFlightRefresh --> RetryLoop
    Auth401 -- "No" --> ResponseParse["12. Response Parser & Unpack<br/>(JSON, Text, Blob, Stream)"]

    ResponseParse --> SchemaValidation{"13. Standard Schema Validator"}
    SchemaValidation -- "Invalid" --> ValidationErrorThrow["Throw ValidationError"]
    SchemaValidation -- "Valid" --> CacheStore["14. Cache Storage & Persistence<br/>(Save LRU, Persist Adapter, Invalidate on Mutate)"]

    CacheStore --> RespInterceptors["15. Response Interceptors<br/>(Inspect or transform response)"]
    RespInterceptors --> OutputFormat{"16. Output Mode"}

    OutputFormat -- "Regular" --> FinalResolve["HttpResponse<T>"]
    OutputFormat -- "unwrap: true" --> UnwrapResolve["response.data"]
    OutputFormat -- "api.safe" --> SafeTuple["[data, null] or [null, error]"]
```

---

## ⚡ Key Architectural Advantages

1. **Zero External Dependencies**:
   * No `axios`, `cross-fetch`, `node-fetch`, or `lodash`.
   * Tiny bundle size (~25 KB minified, 8 KB gzip), minimal memory footprint.
2. **Native Mobile First**:
   * Runs natively on React Native's Hermes engine without polyfills or legacy `XMLHttpRequest` bridges.
   * Persistent storage hooks directly into high-speed native KV engines like **react-native-mmkv** and **AsyncStorage**.
3. **Enterprise Resilience Built-in**:
   * Concurrency limiting, circuit breaking, deduplication, and exponential backoff are native primitives, not loosely coupled plugins.
4. **Type Strictness**:
   * Built with TypeScript `exactOptionalPropertyTypes: true`. Generic types flow through URL resolution, schema validators, responses, and pagination.

