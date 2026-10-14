/**
 * react-native-fetch-client
 *
 * A lightweight, zero-dependency, Fetch-native HTTP client for TypeScript,
 * React Native, Expo, browsers, and Node.js.
 *
 * @module react-native-fetch-client
 */

// Public types — stable API surface
export type {
  HttpMethod,
  ResponseType,
  FetchImpl,
  ProgressEvent,
  PathParams,
  QueryParams,
  RequestConfig,
  ClientConfig,
  ResolvedRequestConfig,
  HttpResponse,
  RetryPolicy,
  ResolvedRetryPolicy,
  AuthConfig,
  DedupConfig,
  CacheConfig,
  CacheStorageAdapter,
  RequestCacheConfig,
  ResponseCache,
  InterceptorFulfilled,
  InterceptorRejected,
  Interceptor,
  InterceptorManager,
  ErrorCode,
  HttpClient,
  SafeHttpClient,
  SafeResult,
  StreamEvent,
  StreamOptions,
  ConcurrencyConfig,
  CircuitState,
  CircuitBreakerConfig,
  StandardSchemaV1,
  ZodLikeSchema,
  FunctionalValidator,
  SchemaValidator,
  DebugLogEntry,
  DebugLogger,
  UploadFileSource,
  UploadOptions,
  PaginationConfig,
  PaginateOptions,
  PaginateHelper,
  MockAdapter,
  MockHandler,
  MockReplyCallback,
  MockHistoryItem,
  PollOptions,
} from './types.js';

// Error classes and type guards — stable API surface
export {
  FetchNativeError,
  HttpError,
  NetworkError,
  TimeoutError,
  CancelError,
  ParseError,
  ConfigError,
  RetryExhaustedError,
  ValidationError,
  CircuitBreakerError,
  isFetchNativeError,
  isHttpError,
  isNetworkError,
  isTimeoutError,
  isCancelError,
  isRetryExhaustedError,
  isValidationError,
  isCircuitBreakerError,
} from './errors.js';

// Client, Auth, Dedup, Cache, Resiliency, Streaming & Interceptors
export { createClient } from './client.js';
export { AuthManager } from './auth.js';
export { DedupManager, generateDedupKey } from './dedup.js';
export { CacheManager, generateCacheKey, cloneData, isCacheEligible } from './cache.js';
export { DefaultInterceptorManager } from './interceptor.js';
export { CircuitBreaker } from './circuit-breaker.js';
export { ConcurrencyLimiter } from './concurrency.js';
export { validateData } from './validator.js';
export { parseSseStream } from './stream.js';
export { buildUrl, interpolatePath, isAbsoluteUrl } from './url.js';
export { createPaginateHelper, parseNextLinkHeader } from './paginate.js';
export { createMockAdapter } from './mock.js';

// Offline Request Queue
export { createOfflineQueue, MemoryStorageAdapter } from './offline/index.js';
export type {
  OfflineQueue,
  OfflineQueueConfig,
  OfflineStorageAdapter,
  QueuedRequest,
  QueueProcessSummary,
} from './offline/index.js';
