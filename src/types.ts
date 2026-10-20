/**
 * Public types for react-native-fetch-client.
 *

 * All types in this file form the stable public API surface.
 * Implementation details are kept in their respective modules.
 *
 * Design principles:
 * - Zero production runtime dependencies (`dependencies: {}`)
 * - Fetch-native primitives (Request, Response, Headers, ReadableStream)
 * - Strict type inference with TypeScript 5+
 * - Comprehensive JSDoc definitions for enhanced developer experience
 */

import type { FetchNativeError } from './errors.js';

// ---------------------------------------------------------------------------

// Primitives
// ---------------------------------------------------------------------------

/** Supported HTTP methods. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** The expected response body format. */
export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'none' | 'stream';

/** A fetch implementation compatible with the global `fetch` signature. */
export type FetchImpl = typeof globalThis.fetch;

/**
 * Progress event payload emitted by download and upload progress callbacks.
 */
export interface ProgressEvent {
  /** Number of bytes transferred so far. */
  loaded: number;
  /** Total number of bytes if known (from Content-Length header or body size). */
  total?: number;
  /** Fraction of transfer completed (0.0 to 1.0) if total is known. */
  progress?: number;
  /** Number of bytes transferred in the most recent chunk. */
  bytes: number;
}

// ---------------------------------------------------------------------------
// Path parameters & Query parameters
// ---------------------------------------------------------------------------

/**
 * Path parameters for URL template interpolation.
 * Replaces `:paramName` or `{paramName}` placeholders in the URL with URI-encoded values.
 *
 * @example
 * ```ts
 * client.get('/users/:id/orders/{orderId}', {
 *   pathParams: { id: 123, orderId: 'ord-456' }
 * });
 * // Dispatches GET to: /users/123/orders/ord-456
 * ```
 */
export type PathParams = Record<string, string | number | boolean>;

/**
 * Query parameters accepted on a request.
 * Values of `null` or `undefined` are omitted from the serialized query string.
 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// Schema Validation (Duck-Typing & Standard Schema)
// ---------------------------------------------------------------------------

/**
 * Standard Schema V1 interface compliant with the cross-library specification.
 * Supported by modern versions of Zod (3.24+), Valibot, ArkType, etc.
 */
export interface StandardSchemaV1<T = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | { readonly value: T; readonly issues?: never }
      | {
          readonly issues: ReadonlyArray<{
            readonly message: string;
            readonly path?: ReadonlyArray<unknown>;
          }>;
          readonly value?: never;
        }
      | Promise<
          | { readonly value: T; readonly issues?: never }
          | {
              readonly issues: ReadonlyArray<{
                readonly message: string;
                readonly path?: ReadonlyArray<unknown>;
              }>;
              readonly value?: never;
            }
        >;
  };
}

/**
 * Zod-like validator interface exposing `.parse()` or `.safeParse()`.
 */
export interface ZodLikeSchema<T = unknown> {
  parse?(data: unknown): T;
  safeParse?(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: { message: string; issues?: unknown } };
}

/**
 * Plain synchronous or asynchronous function validator.
 */
export type FunctionalValidator<T = unknown> = (data: unknown) => T | Promise<T>;

/**
 * Duck-typed schema validator accepted by react-native-fetch-client.
 * Compatible with:

 * 1. Standard Schema v1 (`~standard`)
 * 2. Zod (`z.object({...})`)
 * 3. Valibot / ArkType / Yup / Superstruct
 * 4. Plain validation functions `(data: unknown) => T`
 */
export type SchemaValidator<T = unknown> =
  StandardSchemaV1<T> | ZodLikeSchema<T> | FunctionalValidator<T>;

// ---------------------------------------------------------------------------
// Server-Sent Events (SSE) & Streaming
// ---------------------------------------------------------------------------

/**
 * An event emitted by a Server-Sent Events (SSE) or chunk stream.
 * Parsed according to the WHATWG EventSource specification.
 */
export interface StreamEvent {
  /** The event type specified in `event: <name>`. Defaults to undefined (standard message). */
  event?: string;
  /** The text payload accumulated from `data: <content>` lines. */
  data: string;
  /** The event ID specified in `id: <id>`. */
  id?: string;
  /** The reconnection time in milliseconds specified in `retry: <ms>`. */
  retry?: number;
}

/**
 * Options for streaming requests via `api.stream()`.
 */
export interface StreamOptions extends Omit<RequestConfig, 'responseType'> {
  /**
   * If true, yields raw non-empty text lines rather than parsing SSE event envelopes.
   * Default: false (parses SSE lines into StreamEvent objects).
   */
  rawLines?: boolean;
}

// ---------------------------------------------------------------------------
// Concurrency Limiter
// ---------------------------------------------------------------------------

/**
 * Concurrency configuration for capping simultaneous HTTP requests.
 */
export interface ConcurrencyConfig {
  /**
   * Maximum number of concurrent in-flight requests permitted simultaneously.
   * Requests exceeding this limit wait in an in-memory FIFO queue.
   * 0 or undefined means unlimited. Default: undefined.
   */
  maxConcurrentRequests?: number;
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/** State of the circuit breaker state machine. */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Configuration for the request circuit breaker.
 * Prevents cascading outages by short-circuiting calls to repeatedly failing endpoints.
 */
export interface CircuitBreakerConfig {
  /** Must be set to true to enable the circuit breaker. Default: false. */
  enabled: boolean;
  /** Number of consecutive failures before tripping from CLOSED to OPEN. Default: 5. */
  failureThreshold?: number;
  /** Time in milliseconds to remain OPEN before testing in HALF_OPEN state. Default: 30000 (30s). */
  resetTimeoutMs?: number;
  /** Custom predicate to determine whether an error counts towards failure threshold. */
  isFailure?: (error: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Safe Result
// ---------------------------------------------------------------------------

/**
 * Result tuple returned by `api.safe.*` methods.
 * Implements Go / Rust result semantics: `[data, null]` on success, `[null, error]` on failure.
 * Eliminates try/catch boilerplate in application code.
 */
export type SafeResult<T> = [data: T, error: null] | [data: null, error: FetchNativeError];

// ---------------------------------------------------------------------------
// Debug Logger
// ---------------------------------------------------------------------------

/**
 * Diagnostic log event generated when `debug: true` or a custom logger is enabled.
 */
export interface DebugLogEntry {
  /** HTTP method of the request. */
  method: HttpMethod;
  /** Target request URL. */
  url: string;
  /** HTTP status code (if a response was received). */
  status?: number;
  /** Total elapsed round-trip duration in milliseconds. */
  durationMs: number;
  /** Normalized request headers with authorization tokens redacted. */
  headers?: Record<string, string>;
  /** Whether the response was served from the in-memory cache. */
  cached?: boolean;
  /** Whether the response was returned from an in-flight duplicate deduplication. */
  fromDedup?: boolean;
  /** Error object if the request failed. */
  error?: unknown;
}

/**
 * Custom logger function accepted by the `debug` option.
 */
export type DebugLogger = (entry: DebugLogEntry) => void;

// ---------------------------------------------------------------------------
// File Upload
// ---------------------------------------------------------------------------

/**
 * Supported file input types for `api.upload()`.
 */
export type UploadFileSource =
  | Blob
  | File
  | FormData
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | Record<string, unknown>;

/**
 * Additional options for `api.upload()`.
 */
export interface UploadOptions extends Omit<RequestConfig, 'body'> {
  /**
   * The form field name used when wrapping a raw Blob / File into FormData.
   * Default: `'file'`.
   */
  fieldName?: string;
  /**
   * Optional file name passed to `FormData.append(fieldName, blob, fileName)`.
   */
  fileName?: string;
  /**
   * Additional text or metadata fields appended to the FormData.
   */
  extraFields?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Request configuration
// ---------------------------------------------------------------------------

/**
 * Per-request configuration. All fields are optional.
 * Merged on top of ClientConfig defaults; per-request values take precedence.
 */
export interface RequestConfig {
  /** Absolute URL, or path appended to `baseURL`. */
  url?: string;
  /** HTTP method (default: 'GET'). */
  method?: HttpMethod;
  /**
   * Base URL prepended to `url` when `url` is a relative path.
   * Overrides the client-level baseURL for this request only.
   */
  baseURL?: string;
  /** Alias for baseURL. */
  baseUrl?: string;
  /**
   * HTTP headers. Merged with client-level defaults; per-request values win.
   * Header names are case-insensitive.
   */
  headers?: HeadersInit;
  /**
   * Query parameters appended to the URL.
   * Merged with any params already present in `url`.
   */
  params?: QueryParams;
  /**
   * Path parameters interpolated into `:paramName` or `{paramName}` placeholders in the URL.
   */
  pathParams?: PathParams;
  /**
   * Request body.
   * - Objects and arrays are JSON-serialized; Content-Type is set to application/json.
   * - `FormData` is passed through; Content-Type is intentionally NOT set (Fetch sets it with boundary).
   * - `string`, `Blob`, `ArrayBuffer`, `URLSearchParams` are passed through as-is.
   * - `null` / `undefined` result in no body.
   */
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  /**
   * Request timeout in milliseconds.
   * 0 means no timeout.
   * Overrides the client-level timeout for this request.
   */
  timeout?: number;
  /**
   * An AbortSignal for caller-controlled cancellation.
   * Composed with the internal timeout signal using AbortSignal.any() or a polyfill.
   */
  signal?: AbortSignal;
  /**
   * Expected response body type.
   * Defaults to 'json'. Use 'none' for responses with no body (e.g. 204 No Content).
   * 'json' falls back to 'text' if the body is empty to avoid parse errors.
   */
  responseType?: ResponseType;
  /** Controls credentials (cookies) behavior. Passed directly to fetch(). */
  credentials?: RequestCredentials;
  /**
   * Fetch redirect mode ('follow' | 'manual' | 'error').
   * Passed directly to fetch(). Default: 'follow'.
   */
  redirect?: RequestRedirect;
  /**
   * Node.js Undici Dispatcher (ProxyAgent, custom Agent, mTLS).
   * Passed through to fetch() in Node.js 18+ environments.
   */
  dispatcher?: unknown;
  /**
   * If true, serializes a plain object body to application/x-www-form-urlencoded
   * using URLSearchParams.
   */
  formUrlEncoded?: boolean;
  /**
   * Callback invoked as response bytes are received.
   * Uses WHATWG ReadableStream under the hood.
   */
  onDownloadProgress?: (event: ProgressEvent) => void;
  /**
   * Callback invoked as request body bytes are uploaded.
   */
  onUploadProgress?: (event: ProgressEvent) => void;
  /**
   * Per-request retry policy override.
   * Set to `false` to disable retry for this request even if the client has a default policy.
   */
  retry?: Partial<RetryPolicy> | false;
  /**
   * Override the Fetch implementation for this specific request.
   * Useful for testing or platform-specific transports.
   */
  fetchImpl?: FetchImpl;
  /**
   * Request-level authentication override.
   * Set to `false` or `{ skip: true }` to bypass token attachment and refresh for this request.
   */
  auth?: boolean | { skip?: boolean };
  /**
   * Static or dynamic Bearer token string or async getter function.
   * Automatically attaches `Authorization: Bearer <token>` if no Authorization header exists.
   */
  bearerToken?: string | (() => string | null | undefined | Promise<string | null | undefined>);
  /**
   * Request-level deduplication override.
   * Set to `true` or `{ enabled: true }` to enable in-flight deduplication for this request.
   * Set to `false` or `{ enabled: false }` to disable.
   */
  dedup?: DedupConfig | boolean;
  /**
   * Request-level cache override.
   * Set to `true` to enable caching for this request (uses default TTL).
   * Set to `false` or `{ skip: true }` to bypass caching.
   * Pass `{ ttl: number }` to specify a custom TTL in milliseconds.
   */
  cache?: RequestCacheConfig | boolean;
  /**
   * Optional schema validator (Zod, Standard Schema, Valibot, or function) to parse and validate
   * the response data before returning.
   */
  schema?: SchemaValidator<unknown>;
  /**
   * If true, unwraps the response and returns `response.data` directly instead of the full envelope.
   */
  unwrap?: boolean;
  /**
   * Enables diagnostic logging to the console, or invokes a custom logger function.
   */
  debug?: boolean | DebugLogger;
  /**
   * Per-request circuit breaker override or configuration.
   */
  circuitBreaker?: CircuitBreakerConfig | boolean;
  /**
   * Internal tracking flag indicating whether this request is a post-refresh retry.
   */
  _isRefreshed?: boolean;
  /** Internal tracking flag indicating whether this request is being executed inside dedup wrapper. */
  _isFromDedup?: boolean;
  /** Internal tracking flag indicating whether this request has already acquired a concurrency slot. */
  _isFromConcurrency?: boolean;
  /**
   * Cancellation group key. If a previous request is in-flight with the same group key,
   * it will be automatically aborted when this new request starts. Ideal for search/autocomplete.
   */
  cancelPrevious?: string;
  /**
   * Callback fired when background revalidation finishes in 'stale-while-revalidate' mode.
   */
  onRevalidated?: (response: HttpResponse<unknown>) => void;
  /**
   * Callback fired when background revalidation fails in 'stale-while-revalidate' mode.
   */
  onRevalidationError?: (error: unknown) => void;
  /** Internal tracking flag indicating whether this request is a background SWR revalidation. */
  _isRevalidating?: boolean;
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/**
 * Client-level defaults. All values apply to every request unless overridden.
 * Extends RequestConfig so any RequestConfig field can be set as a client default.
 */
export interface ClientConfig extends Omit<
  RequestConfig,
  'url' | 'method' | 'signal' | 'auth' | 'dedup' | 'cache' | 'circuitBreaker'
> {
  /**
   * Base URL prepended to all relative request URLs.
   * Must not include a trailing slash (enforced at runtime with a warning).
   */
  baseURL?: string;
  /** Alias for baseURL. */
  baseUrl?: string;
  /**
   * Default timeout for all requests in milliseconds. Default: 0 (no timeout).
   */
  timeout?: number;
  /**
   * Default retry policy applied to all requests.
   * Individual requests can override or disable via RequestConfig.retry.
   */
  retry?: Partial<RetryPolicy>;
  /**
   * Request deduplication configuration.
   * Disabled by default — must be explicitly enabled.
   */
  dedup?: DedupConfig;
  /**
   * In-memory cache configuration.
   * Disabled by default — must be explicitly enabled.
   */
  cache?: CacheConfig;
  /**
   * Authentication configuration.
   * Provides callbacks for attaching tokens and refreshing them on 401.
   */
  auth?: AuthConfig;
  /**
   * Static or dynamic Bearer token string or async getter function.
   * Automatically attaches `Authorization: Bearer <token>` if no Authorization header exists.
   */
  bearerToken?: string | (() => string | null | undefined | Promise<string | null | undefined>);
  /**
   * Maximum number of concurrent HTTP requests permitted simultaneously.
   * Excess requests wait in a FIFO queue. Default: undefined (unlimited).
   */
  maxConcurrentRequests?: number;
  /**
   * Circuit breaker configuration to prevent cascading failures.
   */
  circuitBreaker?: CircuitBreakerConfig;
  /**
   * Custom Fetch implementation used for all requests from this client.
   * Defaults to `globalThis.fetch`.
   */
  fetchImpl?: FetchImpl;
  /**
   * Enables diagnostic logging for all requests dispatched by this client.
   */
  debug?: boolean | DebugLogger;
  /**
   * Default unwrapping behavior. When true, returns `response.data` directly.
   */
  unwrap?: boolean;
}

// ---------------------------------------------------------------------------
// Resolved configuration (internal use, exposed on response/error for debug)
// ---------------------------------------------------------------------------

/**
 * The fully resolved configuration after merging client defaults and per-request overrides.
 * Exposed on HttpResponse and error objects for debugging.
 * Authorization headers are redacted before being stored here.
 */
export interface ResolvedRequestConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>; // authorization values redacted to '[REDACTED]'
  params?: QueryParams;
  pathParams?: PathParams;
  timeout: number;
  responseType: ResponseType;
  credentials?: RequestCredentials;
  retry: ResolvedRetryPolicy;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * The resolved response envelope returned from client methods.
 * @template T The type of the parsed response body.
 */
export interface HttpResponse<T = unknown> {
  /** Parsed response data. Type depends on `responseType` and `schema`. */
  data: T;
  /** HTTP status code (e.g. 200, 404). */
  status: number;
  /** HTTP status text (e.g. 'OK', 'Not Found'). */
  statusText: string;
  /** Response headers. Keys are normalized to lowercase. */
  headers: Record<string, string>;
  /** The resolved configuration used for this request. Authorization is redacted. */
  config: ResolvedRequestConfig;
  /** True when data was served from the in-memory cache or 304 Not Modified. */
  cached: boolean;
  /** True when data was served from stale cache in stale-while-revalidate mode. */
  stale?: boolean;
  /** True when this response was shared with another in-flight duplicate request. */
  fromDedup: boolean;
  /** The original Fetch Request object. */
  request: Request;
  /** Total round-trip execution duration in milliseconds. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

/**
 * Retry policy for a request.
 * Only idempotent methods are retried by default.
 */
export interface RetryPolicy {
  /**
   * Maximum number of retry attempts after the initial request.
   * Default: 0 (no retries).
   */
  attempts: number;
  /**
   * Backoff strategy between retries.
   * - 'exponential': delay doubles each attempt (e.g. 1s, 2s, 4s).
   * - 'linear': delay grows linearly (delay * attempt).
   * Default: 'exponential'.
   */
  backoff: 'exponential' | 'linear';
  /**
   * Base delay in milliseconds between retries.
   * Default: 1000.
   */
  delay: number;
  /**
   * Maximum delay cap in milliseconds (for exponential backoff).
   * Default: 30000.
   */
  maxDelay: number;
  /**
   * Add random jitter to the retry delay to avoid thundering herd.
   * Default: true.
   */
  jitter: boolean;
  /**
   * HTTP status codes or predicate function that triggers a retry.
   * Default: [429, 500, 502, 503, 504].
   */
  retryOn: number[] | ((error: unknown, attempt: number) => boolean);
  /**
   * Methods that are eligible for retry.
   * Default: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].
   * POST and PATCH are excluded to prevent duplicate mutations.
   */
  safeMethods: HttpMethod[];
  /**
   * Whether to respect the Retry-After response header.
   * When true, uses the header value as the retry delay (up to maxDelay).
   * Default: true.
   */
  respectRetryAfter: boolean;
  /**
   * Optional custom retry predicate. When provided, evaluated to decide if retry occurs.
   */
  retryCondition?: (error: unknown, attempt: number) => boolean;
}

/** Internal resolved retry policy with all required fields guaranteed present. */
export interface ResolvedRetryPolicy {
  attempts: number;
  backoff: 'exponential' | 'linear';
  delay: number;
  maxDelay: number;
  jitter: boolean;
  retryOn: number[] | ((error: unknown, attempt: number) => boolean);
  safeMethods: HttpMethod[];
  respectRetryAfter: boolean;
  retryCondition?: (error: unknown, attempt: number) => boolean;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Authentication configuration provided at client creation.
 * The library does not manage token storage — that is the caller's responsibility.
 */
export interface AuthConfig {
  /**
   * Called before each request. Must return the current access token string,
   * or `null`/`undefined` to skip adding an Authorization header.
   */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Called when a 401 response is received.
   * Must refresh the access token and return the new token string.
   * Throw from this function to signal that refresh failed.
   * Multiple concurrent 401s share a single refresh call (single-flight).
   */
  refreshToken?: () => string | Promise<string>;
  /**
   * HTTP status codes that trigger a token refresh attempt.
   * Default: [401].
   */
  refreshOn?: number[];
  /**
   * Header name to attach the token to.
   * Default: 'Authorization'.
   */
  headerName?: string;
  /**
   * Token prefix placed before the token value.
   * Default: 'Bearer '.
   */
  tokenPrefix?: string;
  /**
   * URLs that should NOT trigger a token refresh when they return 401.
   * Typically includes the refresh endpoint itself to prevent recursive refresh.
   * Accepts exact strings or RegExp patterns.
   */
  refreshExcludeUrls?: Array<string | RegExp>;
  /**
   * Proactive token expiry predicate. If this returns true, `refreshToken()` is called
   * before dispatching the request to avoid an unnecessary 401 roundtrip.
   */
  isExpired?: () => boolean | Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * In-flight request deduplication configuration.
 * When enabled, concurrent identical GET requests share one network call.
 */
export interface DedupConfig {
  /** Must be explicitly set to true to enable deduplication. Default: false. */
  enabled: boolean;
  /**
   * Methods eligible for deduplication.
   * Default: ['GET', 'HEAD'].
   * POST, PUT, PATCH, DELETE are excluded to prevent deduplicating mutations.
   */
  methods?: HttpMethod[];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Pluggable persistent storage adapter for response caching (MMKV, AsyncStorage, localStorage, etc.).
 */
export interface CacheStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
  clear?(): Promise<void> | void;
}

/**
 * Request-level cache configuration.
 */
export interface RequestCacheConfig {
  /** Time-to-live for this specific request in milliseconds. */
  ttl?: number;
  /** Explicitly bypass the cache for this request. Default: false. */
  skip?: boolean;
  /**
   * Enable RFC 7234 conditional validation (ETag / If-None-Match, Last-Modified / If-Modified-Since).
   * When true, sends validation headers and reuses cached body on 304 Not Modified.
   */
  etag?: boolean;
  /**
   * Caching strategy for this request:
   * - 'cache-first': Return cached data if fresh; otherwise hit network. (Default)
   * - 'stale-while-revalidate': Return stale cached data immediately (0ms), then revalidate in background.
   */
  strategy?: 'cache-first' | 'stale-while-revalidate';
  /**
   * Callback fired when background revalidation finishes in 'stale-while-revalidate' mode.
   */
  onRevalidated?: (response: HttpResponse<unknown>) => void;
  /**
   * Callback fired when background revalidation fails in 'stale-while-revalidate' mode.
   */
  onRevalidationError?: (error: unknown) => void;
  /**
   * Specific URL patterns or routes to purge from the cache when this request succeeds.
   * Useful for mutations (POST, PUT, DELETE) to invalidate related collection endpoints.
   */
  invalidate?: Array<string | RegExp>;
}

/** In-memory and persistent cache configuration for client-level setup. */
export interface CacheConfig {
  /** Must be explicitly set to true to enable caching. Default: false. */
  enabled: boolean;
  /**
   * Default time-to-live for cached entries in milliseconds.
   * Default: 60000 (1 minute).
   */
  defaultTtl?: number;
  /** Legacy alias or shorthand for defaultTtl. */
  ttl?: number;
  /**
   * Maximum number of cached responses in memory before LRU eviction.
   * Default: 100 entries.
   */
  maxSize?: number;
  /**
   * Methods whose responses are eligible for caching.
   * Default: ['GET', 'HEAD'].
   * POST, PUT, PATCH, and DELETE are strictly disallowed.
   */
  methods?: HttpMethod[];
  /**
   * Whether to allow caching authenticated requests (requests with an Authorization header).
   * When true, cache keys partition responses per unique authorization header.
   * When false (default), requests carrying Authorization are never cached.
   * Default: false.
   */
  allowAuthenticated?: boolean;
  /**
   * Enable RFC 7234 conditional validation (ETag / If-None-Match) globally.
   * Default: true when cache is enabled.
   */
  etag?: boolean;
  /**
   * Optional persistent storage adapter (e.g. MMKV, AsyncStorage, localStorage, MemoryStorageAdapter).
   * When configured, cached responses survive application reboots and are hydrated on initialization.
   */
  storage?: CacheStorageAdapter;
  /**
   * Storage key prefix or key name used when persisting cache entries to `storage`.
   * Default: 'rnfc_http_cache'.
   */
  storageKey?: string;
  /**
   * Default caching strategy across all cacheable requests:
   * - 'cache-first' (default)
   * - 'stale-while-revalidate'
   */
  strategy?: 'cache-first' | 'stale-while-revalidate';
  /**
   * Alias for `strategy`.
   */
  defaultStrategy?: 'cache-first' | 'stale-while-revalidate';
}

/**
 * Public interface of the response cache manager.
 */
export interface ResponseCache {
  /** Get a cached response by key if present and not expired. */
  get<T = unknown>(key: string): HttpResponse<T> | undefined;
  /** Store a response in cache with optional TTL. */
  set<T = unknown>(key: string, response: HttpResponse<T>, ttlMs?: number): void;
  /** Check if a key exists in cache and is not expired. */
  has(key: string): boolean;
  /** Delete a specific cache entry. */
  delete(key: string): boolean;
  /** Delete all cache entries matching a string prefix or RegExp pattern. */
  deletePattern(pattern: string | RegExp): number;
  /** Clear all cache entries. */
  clear(): void;
  /** Number of currently cached entries in memory. */
  readonly size: number;
  /** Hydrate cache store from persistent storage adapter if configured. */
  hydrate(): Promise<void>;
  /** Persist current in-memory cache to storage adapter if configured. */
  persist(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

/**
 * A fulfilled interceptor handler.
 * @template V The value type this handler receives and may return.
 */
export type InterceptorFulfilled<V> = (value: V) => V | Promise<V>;

/**
 * A rejected interceptor handler.
 * Receives the error. May rethrow, transform, or recover by returning a value.
 */
export type InterceptorRejected = (error: unknown) => unknown;

/** A registered interceptor pair. */
export interface Interceptor<V> {
  fulfilled: InterceptorFulfilled<V>;
  rejected?: InterceptorRejected;
}

/**
 * Manages a list of interceptors of a specific type.
 * @template V The value type flowing through the interceptor chain.
 */
export interface InterceptorManager<V> {
  /**
   * Register a new interceptor.
   * @returns A numeric ID that can be passed to `eject()` to remove the interceptor.
   */
  use(fulfilled: InterceptorFulfilled<V>, rejected?: InterceptorRejected): number;
  /** Remove a previously registered interceptor by its ID. */
  eject(id: number): void;
  /** Remove all registered interceptors. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/** Discriminant code on all FetchNativeError instances. */
export type ErrorCode =
  | 'HTTP_ERROR' // non-2xx response received
  | 'NETWORK_ERROR' // fetch() rejected before a response was received
  | 'TIMEOUT' // request exceeded the configured timeout
  | 'CANCELLED' // request was aborted via AbortSignal
  | 'PARSE_ERROR' // response body could not be parsed as the expected type
  | 'CONFIG_ERROR' // invalid configuration detected at request time
  | 'RETRY_EXHAUSTED' // all retry attempts were consumed
  | 'VALIDATION_ERROR' // response body failed schema validation
  | 'CIRCUIT_OPEN'; // circuit breaker is OPEN, blocking the request

// ---------------------------------------------------------------------------
// Safe Client Interface
// ---------------------------------------------------------------------------

/**
 * Safe client methods that return `[data, error]` tuples instead of throwing.
 */
export interface SafeHttpClient {
  /** Send a safe GET request. */
  get<T = unknown>(url: string, config?: RequestConfig): Promise<SafeResult<T>>;
  /** Send a safe POST request. */
  post<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<SafeResult<T>>;
  /** Send a safe PUT request. */
  put<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<SafeResult<T>>;
  /** Send a safe PATCH request. */
  patch<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<SafeResult<T>>;
  /** Send a safe DELETE request. */
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<SafeResult<T>>;
  /** Alias for delete. */
  del<T = unknown>(url: string, config?: RequestConfig): Promise<SafeResult<T>>;
  /** Send a safe request with arbitrary method. */
  request<T = unknown>(
    config: RequestConfig & { url: string; method: HttpMethod },
  ): Promise<SafeResult<T>>;
}

// ---------------------------------------------------------------------------
// Auto-Pagination
// ---------------------------------------------------------------------------

/**
 * Options for configuring auto-pagination traversal.
 */
export interface PaginationConfig<T = unknown> {
  /**
   * Strategy:
   * - 'page': Increments page number query param. (Default)
   * - 'offset': Increments offset query param by limit/pageSize.
   * - 'cursor': Uses cursor token extracted from response.
   * - 'linkHeader': Parses RFC 5988 / 8288 `Link: <url>; rel="next"` header.
   */
  type?: 'page' | 'offset' | 'cursor' | 'linkHeader';
  /** Query parameter name for page number. Default: 'page'. */
  pageParam?: string;
  /** Alias for pageParam. */
  param?: string;
  /** Initial page index (usually 1 or 0). Default: 1. */
  initialPage?: number;
  /** Query parameter name for page size / limit. Default: 'limit'. */
  pageSizeParam?: string;
  /** Alias for pageSizeParam. */
  limitParam?: string;
  /** Page size limit value. */
  pageSize?: number;
  /** Alias for pageSize. */
  limit?: number;
  /** Query parameter name for offset. Default: 'offset'. */
  offsetParam?: string;
  /** Initial offset index. Default: 0. */
  initialOffset?: number;
  /** Query parameter name for cursor token. Default: 'cursor'. */
  cursorParam?: string;
  /** Initial cursor token value. */
  initialCursor?: string | number;
  /**
   * Custom function to extract the next cursor from the response.
   * Return null or undefined when no further pages exist.
   */
  getNextCursor?: (response: HttpResponse<T>) => string | number | null | undefined;
  /**
   * Custom function to extract the next URL directly from the response envelope.
   * Return null or undefined when no further pages exist.
   */
  getNextUrl?: (response: HttpResponse<T>) => string | null | undefined;
  /**
   * Custom function to extract the array of items from response data.
   * Default: returns `data` if it is an Array, or the first Array property found in `data`.
   */
  getItems?: (data: T) => unknown[];
  /** Maximum number of pages to fetch to prevent infinite loops. Default: 50. */
  maxPages?: number;
  /** Alias for maxPages. */
  totalPages?: number;
}

/**
 * Request options extended with pagination configuration.
 */
export interface PaginateOptions<T = unknown> extends Omit<RequestConfig, 'params'> {
  params?: QueryParams;
  pagination?: PaginationConfig<T>;
}

/**
 * Auto-pagination helper attached to the client instance (`api.paginate`).
 */
export interface PaginateHelper {
  /**
   * Yields items individually across paginated endpoints.
   *
   * @example
   * ```ts
   * for await (const user of api.paginate<User>('/users')) {
   *   console.log(user.name);
   * }
   * ```
   */
  <TItem = unknown, TResponse = unknown>(
    url: string,
    options?: PaginateOptions<TResponse>,
  ): AsyncGenerator<TItem, void, unknown>;

  /**
   * Yields full HttpResponse page objects across paginated endpoints.
   */
  pages<TResponse = unknown>(
    url: string,
    options?: PaginateOptions<TResponse>,
  ): AsyncGenerator<HttpResponse<TResponse>, void, unknown>;

  /**
   * Collects all paginated items into a single flattened array.
   */
  all<TItem = unknown, TResponse = unknown>(
    url: string,
    options?: PaginateOptions<TResponse>,
  ): Promise<TItem[]>;
}

// ---------------------------------------------------------------------------
// Testing Mock Adapter
// ---------------------------------------------------------------------------

/**
 * Dynamic callback generating a mock response based on the dispatched request config.
 */
export type MockReplyCallback<T = unknown> = (
  config: RequestConfig & { url: string; method: HttpMethod },
) => [number, T?, Record<string, string>?] | Promise<[number, T?, Record<string, string>?]>;

/**
 * Route handler definition for the mock adapter.
 */
export interface MockHandler {
  readonly method: HttpMethod | 'ANY';
  readonly url: string | RegExp;
  /** Respond with a specific HTTP status code, data, and optional headers. */
  reply(status: number, data?: unknown, headers?: Record<string, string>): void;
  /** Respond with a dynamic callback returning [status, data, headers]. */
  reply(callback: MockReplyCallback): void;
  /** Simulate a network timeout error (`TimeoutError`). */
  replyWithTimeout(): void;
  /** Simulate a network connection failure (`NetworkError`). */
  replyWithNetworkError(message?: string): void;
}

/**
 * Captured history record of a request intercepted by the mock adapter.
 */
export interface MockHistoryItem {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  params?: QueryParams;
  pathParams?: PathParams;
}

/**
 * Mock adapter instance returned by `createMockAdapter(client)`.
 */
export interface MockAdapter {
  onGet(url?: string | RegExp): MockHandler;
  onPost(url?: string | RegExp): MockHandler;
  onPut(url?: string | RegExp): MockHandler;
  onPatch(url?: string | RegExp): MockHandler;
  onDelete(url?: string | RegExp): MockHandler;
  onAny(url?: string | RegExp): MockHandler;
  /** Clear all mock route handlers and captured history. */
  reset(): void;
  /** Clear all registered mock route handlers. */
  resetHandlers(): void;
  /** Clear captured request history. */
  resetHistory(): void;
  /** Restore the original fetch implementation on the client. */
  restore(): void;
  /** Captured request history grouped by method. */
  history: Record<Lowercase<HttpMethod> | 'all', MockHistoryItem[]>;
}

// ---------------------------------------------------------------------------
// Client instance
// ---------------------------------------------------------------------------

/**
 * An HTTP client instance returned by `createClient()`.
 */
export interface HttpClient {
  /**
   * Send a GET request.
   * @template T Expected type of the parsed response body.
   */
  get<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  /**
   * Send a POST request.
   * @template T Expected type of the parsed response body.
   */
  post<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<HttpResponse<T>>;
  /**
   * Send a PUT request.
   * @template T Expected type of the parsed response body.
   */
  put<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<HttpResponse<T>>;
  /**
   * Send a PATCH request.
   * @template T Expected type of the parsed response body.
   */
  patch<T = unknown>(
    url: string,
    body?: RequestConfig['body'],
    config?: RequestConfig,
  ): Promise<HttpResponse<T>>;
  /**
   * Send a DELETE request.
   * @template T Expected type of the parsed response body.
   */
  delete<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  /**
   * Alias for `delete()`.
   * @template T Expected type of the parsed response body.
   */
  del<T = unknown>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  /**
   * Send a request with full configuration control.
   * All other methods delegate to this.
   */
  request<T = unknown>(
    config: RequestConfig & { url: string; method: HttpMethod },
  ): Promise<HttpResponse<T>>;
  /** Response cache manager. */
  cache: ResponseCache;
  /** Request and response interceptor managers. */
  interceptors: {
    request: InterceptorManager<RequestConfig>;
    response: InterceptorManager<HttpResponse<unknown>>;
  };
  /**
   * Safe request interface returning Go/Rust style `[data, error]` tuples without throwing.
   */
  safe: SafeHttpClient;
  /**
   * Stream Server-Sent Events (SSE) or chunked responses using an AsyncGenerator.
   */
  stream(url: string, options?: StreamOptions): AsyncGenerator<StreamEvent, void, unknown>;
  /**
   * Upload helper that simplifies file and FormData uploads with automatic boundary handling
   * and progress tracking.
   */
  upload<T = unknown>(
    url: string,
    file: UploadFileSource,
    options?: UploadOptions,
  ): Promise<HttpResponse<T>>;
  /**
   * Auto-pagination traversal helper.
   */
  paginate: PaginateHelper;
  /**
   * Polls an endpoint repeatedly until a condition is met or timeout expires.
   */
  poll<T = unknown>(url: string, options: PollOptions<T>): Promise<HttpResponse<T>>;
}

/**
 * Configuration options for `api.poll()`.
 */
export interface PollOptions<T = unknown> extends RequestConfig {
  /** Polling interval in milliseconds. Default: 1000. */
  interval?: number;
  /** Maximum total time to poll in milliseconds before throwing TimeoutError. Default: 30000. */
  timeout?: number;
  /** Predicate returning true when polling has succeeded. */
  until: (response: HttpResponse<T>) => boolean | Promise<boolean>;
  /** Optional backoff multiplier for interval growth (e.g. 1.5). Default: 1 (fixed interval). */
  backoff?: number;
}

/**
 * Pre-instantiated default HTTP client instance with `create` factory methods.
 */
export interface DefaultHttpClient extends HttpClient {
  /**
   * Factory function to create custom isolated `HttpClient` instances.
   */
  create: (config?: ClientConfig) => HttpClient;
  /**
   * Alias for `create()`.
   */
  createClient: (config?: ClientConfig) => HttpClient;
}
