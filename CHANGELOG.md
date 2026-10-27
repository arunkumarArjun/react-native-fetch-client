# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-10-27

### Security & VAPT Hardening

- **Cross-Origin Credential Isolation (SSRF & Token Leak Guard)**: Outgoing credentials (`bearerToken` and `authManager`) are now strictly restricted to the configured `baseURL` origin. Target URLs calling external/third-party domains omit credentials unless explicitly enabled via `allowCrossOrigin: true`.
- **401 Cross-Origin Isolation**: Untrusted third-party endpoints returning 401 Unauthorized do not trigger the client's token refresh mutex.
- **Persistent Storage Sanitization (CWE-312)**: Response headers stored in persistent cache adapters (`MMKV`, `AsyncStorage`) automatically strip `Set-Cookie`, `Set-Cookie2`, and `Authorization`, eliminating plaintext session cookies on local device storage.
- **Offline Queue Plaintext Token Prevention**: Queued offline requests strip static `Authorization` headers prior to serialization, allowing the client to dynamically evaluate and attach the latest active session token at replay time.
- **Sensitive Header Redaction in Error Objects (CWE-532)**: `Cookie`, `Set-Cookie`, `Proxy-Authorization`, `X-Api-Key`, and `X-Auth-Token` are now automatically redacted to `'[REDACTED]'` alongside `Authorization` in debug logs and error objects.

### Performance & Hermes Optimization

- **Fast-Path Header Merging**: `mergeHeaders` now fast-paths plain JavaScript objects, avoiding expensive native C++ `new Headers()` JNI allocations in React Native Hermes on every request.
- **Production Build Minification**: Enabled `minify: true` in `tsup`, reducing the core distribution bundle by **57%** (from 89.7 KB down to 38.5 KB; 12.8 KB min+gzip) while preserving full sourcemaps and TypeScript declaration files.

### Documentation & Guides

- Added end-to-end **TanStack Query (React Query)** pairing guide and runnable recipe (`examples/04-tanstack-query.ts`).
- Added **NetInfo** reconnection event listener recipe for automatic offline queue replay (`@react-native-community/netinfo`).
- Added CommonJS (`require`) and TypeScript `moduleResolution` interop instructions.

---

## [0.3.0] - 2026-10-26

### Breaking Changes & Architecture Refactor

- **Modular Subpath Exports**:
  - `createMockAdapter` and testing types (`MockAdapter`, `MockHandler`, `MockReplyCallback`, `MockHistoryItem`) are now imported from `react-native-fetch-client/mock`.
  - `createOfflineQueue`, `MemoryStorageAdapter`, and offline types are now imported from `react-native-fetch-client/offline`.
  - Root `react-native-fetch-client` entry point now exports only core HTTP client primitives, achieving 0 KB production bundle impact for test mocking and offline storage utilities.
- **Removed Circuit Breaker**:
  - Removed `CircuitBreaker`, `CircuitBreakerError`, `isCircuitBreakerError`, and `circuitBreaker` options from `ClientConfig` and `RequestConfig`.
  - Mobile resilience is standardized around native **Exponential Backoff with Jitter Retry**, eliminating client-side circuit lockout issues on mobile connection transitions.

### Performance & Bundle Optimization

- **Bundle Size Reduction**:
  - Core Minified Bundle: Reduced from **45.76 KB** to **36.93 KB** (-19.3%).
  - Core Gzip: Reduced from **15.07 KB** to **12.05 KB** (-20.0%).
  - Tree-shaken Consumer: Reduced to **11.64 KB** gzip / **10.43 KB** brotli.
  - Mock Adapter Plugin: Isolated to **3.13 KB** minified (**1.49 KB** gzip).
  - Offline Queue Plugin: Isolated to **5.42 KB** minified (**2.21 KB** gzip).

---

## [0.2.0] - 2026-10-23

### Added

- **Async Webhook and Resource Waiter (`api.waitFor`)**: Added a specialized method for asynchronous event and job settlement (3DS payments, Apple Pay/UPI webhooks, KYC verification, cloud provisioning). Supports success predicates (`until`), immediate failure termination (`stopIf`), transient status code suppression (`ignoreErrors`, e.g. ignoring `404 Not Found` while background database writes occur), backoff ceiling caps (`maxInterval`), attempt limits (`maxAttempts`), and progress event callbacks (`onTick`).
- **Error Types & Guards**: Exported `WaitForAbortedError` and `isWaitForAbortedError` type guard for handling terminal fast-abort responses.

### Optimized & Refactored

- **Engine Deduplication**: Refactored `api.poll()` to share the resilient loop and timer engine with `api.waitFor()`, eliminating over 140 lines of duplicate polling code and reducing raw bundle size by over 4 KB without changing public API signatures or runtime behavior.
- **Documentation Overhaul**: Modernized all documentation guides and references to a clean, authoritative technical style without emojis, adding complete configuration reference tables and platform behavior matrices.

### Fixed & Security

- **Security - Auth Header Token Hashing in Cache Keys**: Pre-emptively hashes `Authorization` tokens to opaque deterministic hex digests before cache key composition, eliminating credential leaks in persistent cache storage and debug logs.
- **Cross-Domain Cache & Deduplication Isolation**: Preserves URL origins on absolute paths to avoid cross-domain key collisions, paired with path-exact cache eviction on mutations (`deleteExactPath`).
- **Cross-Engine `createAbortError`**: Added safe fallback for runtimes where the global `DOMException` is absent (such as older React Native JSC or Hermes engines).
- **Binary `ArrayBufferView` Preservation**: Fixed body serialization so native `Uint8Array`, `Buffer`, and `DataView` are preserved as binary payloads rather than JSON-stringified.
- **SSE Stream Abort Termination**: Background stream readers are aborted immediately when `options.signal` triggers.
- **Offline Queue Path Parameter Interpolation**: Restores dynamic `pathParams` when offline requests are replayed.
- **RFC-Compliant 204/205/304 Mock Responses**: `MockAdapter` automatically supplies `null` body for null-body HTTP statuses per WHATWG Fetch specification.
- **Extended HTTP Shorthands**: Added `.head()` and `.options()` to `HttpClient` and `SafeHttpClient`, with corresponding `onHead` and `onOptions` in `MockAdapter`.
- **Circuit Breaker Inspection API**: Added `.getState()`, `.getFailureCount()`, and `.reset()` inspection on `api.circuitBreaker`.
- **Query Parameter Array Support**: Supported `(string | number | boolean)[]` in query params and preserved `#` hash fragments during URL construction.
- **Async Schema Validation**: Added full support for async Zod and Standard Schema v1 validation (`safeParseAsync` / `parseAsync`).

## [0.1.7] - 2026-10-20

### Fixed & Tested

- **Binary Upload Slice Offsets**: Fixed `api.upload()` to respect `byteOffset` and `byteLength` on `Uint8Array`, `DataView`, and other `ArrayBufferView` typed arrays when converting to `Blob`, preventing unneeded bytes from the backing buffer from being uploaded.
- **Smart Polling Deadline Enforcement**: Configured `api.poll()` with an overall timeout controller so that hanging in-flight network requests are automatically aborted when the polling deadline expires.
- **Immediate Polling Delay Cancellation**: Replaced uncancelable interval `setTimeout` with an abort-aware delay helper, ensuring caller cancellation immediately interrupts the wait and prevents subsequent requests.
- **Client Cancellation Group Isolation**: Scoped `cancelPrevious` cancellation maps to individual `HttpClient` instances, preventing separate clients sharing group names from unintentionally cancelling each other.

## [0.1.6] - 2026-10-16

### Added

- **Axios Parity & DX Enhancements**: Added default client instance export (`import client from 'react-native-fetch-client'`), `baseUrl` option alias (in addition to `baseURL`), and `api.del()` shorthand method alias for `api.delete()`.
- **Interactive Documentation Website**: Launched official interactive documentation and playground at [https://react-native-fetch-client.vercel.app/](https://react-native-fetch-client.vercel.app/).
- **GitHub Community Standards**: Added PR template (`.github/pull_request_template.md`) and formal Accessibility Statement (`ACCESSIBILITY.md`).

### Fixed & Tested

- **Cold Restart Recovery & Idempotency Persistence**: Verified and documented that `Idempotency-Key` headers survive cold application restarts when queued requests are hydrated from persistent storage (`MMKV`, `AsyncStorage`, etc.). Added comprehensive end-to-end recovery test suite asserting single server-side writes on replay with RFC deduplication.
- **CI Linting & Formatting**: Fixed `@typescript-eslint/require-await` and standardized code formatting via Prettier in test suites.

## [0.1.5] - 2026-10-14

### Security

- **URL Resolution (CWE-1333)**: Replaced polynomial backtracking regular expressions in `buildUrl` and `isAbsoluteUrl` with linear $O(n)$ index-based slash trimming and protocol parsing to eliminate ReDoS vulnerabilities (CodeQL `js/polynomial-redos`).
- **CI Workflow Hardening (CWE-275)**: Configured least-privilege `permissions: { contents: read }` across GitHub Actions CI workflows.
- **Dependency Vulnerability Remediation**: Overrode transitive `esbuild` to `0.28.2` in `package.json` to eliminate Windows dev server path traversal vulnerability. Removed obsolete `yarn.lock` to standardize on `package-lock.json`.

### Added

- **Exported `isAbsoluteUrl`**: Exported `isAbsoluteUrl` helper utility from root entry point to check for protocol-relative or absolute URI schemes safely.

## [0.1.4] - 2026-10-14

### Added

- **Security & Community Governance**: Added formal `SECURITY.md` (backed by GitHub Private Vulnerability Reporting), `CODE_OF_CONDUCT.md`, and structured issue templates.
- **Supply-Chain Integrity**: Configured npm cryptographic provenance attestation (`publishConfig.provenance = true`) via Sigstore in GitHub Actions.

## [0.1.3] - 2026-10-13

### Added

- **Smart Polling Helper (`api.poll`)**: Poll asynchronous endpoints until an `until` predicate resolves to true, with configurable `interval`, `timeout`, and exponential `backoff`.
- **Search Autocomplete Auto-Cancel (`cancelPrevious`)**: Pass a cancellation group key to automatically cancel previous in-flight requests in the group as newer queries are dispatched.
- **Request Latency Metric (`response.durationMs`)**: Exposed elapsed roundtrip time directly on `HttpResponse` across network calls, LRU cache hits, and 304 revalidations.
- **Proactive Auth Token Refresh (`isExpired`)**: Optional predicate on `AuthConfig` to refresh expired tokens before dispatching, avoiding the initial failed 401 roundtrip.
- **Declarative Cache Invalidation (`cache.invalidate`)**: Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) can declare route paths or RegExp patterns to purge associated collection lists from cache upon success.
- **SWR Background Error Callback (`onRevalidationError`)**: Callback on `RequestCacheConfig` to catch and inspect background revalidation failures without crashing the UI.

## [0.1.2] - 2026-10-12

### Added

- **Declarative Testing Mock Adapter (`createMockAdapter`)**: Zero-dependency mock adapter for route stubbing, error simulations, and call history assertions.
- **Standard Schema v1 Support (`schema`)**: Duck-typed runtime schema validation compatible with Zod, Valibot, ArkType, and custom validator functions.
- **RFC 7234 Conditional Validation (`etag: true`)**: Automatic tracking of `ETag` and `Last-Modified` headers, reusing cached payloads on HTTP 304 Not Modified.
- **Persistent Storage Adapter (`storage`)**: Pluggable storage interface for MMKV, AsyncStorage, and localStorage with automatic hydration on startup.

## [0.1.1] - 2026-10-10

### Added

- **Persistent Offline Queue (`createOfflineQueue`)**: Queue mutations offline and sequentially replay them with RFC-standard `Idempotency-Key` headers when back online.
- **Auto-Pagination Helper (`api.paginate`)**: Async generator streaming and `.all()` collection helper supporting `page`, `offset`, `cursor`, and `Link` headers.
- **Native AI & SSE Streaming (`api.stream`)**: Server-Sent Events (SSE) and raw LLM token streaming via WHATWG `ReadableStream` and async generators.
- **Circuit Breaker (`circuitBreaker`)**: Three-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) to prevent cascading microservice failures.
- **Concurrency Throttler (`maxConcurrentRequests`)**: FIFO queue capping simultaneous in-flight sockets.

## [0.1.0] - 2026-10-09

### Added

- Initial public release.
- Zero runtime dependencies (`dependencies: {}`).
- First-class TypeScript generics and dual ESM (`.mjs`) + CommonJS (`.cjs`) builds.
- Native WHATWG `fetch` execution pipeline for React Native (Bridgeless / New Architecture), Expo, Web, and Node.js.
- Single-flight 401 token refresh mutex.
- In-flight request deduplication for concurrent `GET`/`HEAD` requests.
- In-memory Least Recently Used (LRU) response cache and Stale-While-Revalidate (SWR).
- Resilient retry engine with exponential backoff, full jitter, and `Retry-After` header support.
- Safe Go/Rust-style tuple returns (`api.safe.*`).
- Express-style (`:id`) and OpenAPI-style (`{id}`) path parameter interpolation.
