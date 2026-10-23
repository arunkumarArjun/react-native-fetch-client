# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-23

### Added

- **Universal DevTools Stealth Mode (`hideFromDevTools`)**: Added a privacy and security filter across client and request levels to suppress sensitive endpoints (payment credentials, authentication handshakes, biometric tokens, PII) from developer inspection tools. In React Native, hooks `XHRInterceptor` for both request transmission and response delivery, preventing network inspection in Chrome Inspect (`chrome://inspect`), Hermes Debugger, and Flipper. Suppresses debug logs, console output, and telemetry error captures across all platforms.
- **Async Webhook and Resource Waiter (`api.waitFor`)**: Added a specialized method for asynchronous event and job settlement (3DS payments, Apple Pay/UPI webhooks, KYC verification, cloud provisioning). Supports success predicates (`until`), immediate failure termination (`stopIf`), transient status code suppression (`ignoreErrors`, e.g. ignoring `404 Not Found` while background database writes occur), backoff ceiling caps (`maxInterval`), attempt limits (`maxAttempts`), and progress event callbacks (`onTick`).
- **Error Types & Guards**: Exported `WaitForAbortedError` and `isWaitForAbortedError` type guard for handling terminal fast-abort responses.

### Optimized & Refactored

- **Engine Deduplication**: Refactored `api.poll()` to share the resilient loop and timer engine with `api.waitFor()`, eliminating over 140 lines of duplicate polling code and reducing raw bundle size by over 4 KB without changing public API signatures or runtime behavior.
- **Complete DevTools Response Suppression**: Fixed an oversight in React Native devtools suppression where `setResponseCallback` was not hooked alongside `setSendCallback`, ensuring incoming response data is completely suppressed for protected endpoints.
- **Documentation Overhaul**: Modernized all documentation guides and references to a clean, authoritative technical style without emojis, adding complete configuration reference tables and platform behavior matrices.

### Fixed & Security

- **Security - Auth Header Token Hashing in Cache Keys**: Pre-emptively hashes `Authorization` tokens to opaque deterministic hex digests before cache key composition, eliminating credential leaks in persistent cache storage and debug logs.
- **Cross-Domain Cache & Deduplication Isolation**: Preserves URL origins on absolute paths to avoid cross-domain key collisions, paired with path-exact cache eviction on mutations (`deleteExactPath`).
- **Cross-Engine `createAbortError`**: Added safe fallback for runtimes where the global `DOMException` is absent (such as older React Native JSC or Hermes engines).
- **DevTools Concurrent Hook Reference-Counting**: Replaced singleton suppression hook state with reference-counted listeners to prevent callback leaks and race conditions under concurrent requests.
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
