# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
