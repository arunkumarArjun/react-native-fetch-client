/**
 * Error hierarchy for react-native-fetch-client.
 *

 * Key design decision: HttpError is NOT a subclass of NetworkError.
 * A 404 or 500 is a received HTTP response — not a failure to connect.
 * Use the `.code` property or `instanceof` to distinguish error types.
 */

import type { ErrorCode, HttpResponse, ResolvedRequestConfig } from './types.js';

// ---------------------------------------------------------------------------
// Helper: build options object without explicit undefined values
// exactOptionalPropertyTypes requires absent props, not props set to undefined.
// ---------------------------------------------------------------------------

type BaseOptions = { config?: ResolvedRequestConfig; cause?: unknown };

function buildOptions(partial: {
  config?: ResolvedRequestConfig | undefined;
  cause?: unknown;
}): BaseOptions {
  const opts: BaseOptions = {};
  if (partial.config !== undefined) opts.config = partial.config;
  if (partial.cause !== undefined) opts.cause = partial.cause;
  return opts;
}

/**
 * Safely creates an AbortError with cross-platform fallback.
 * Prevents ReferenceError in React Native Hermes and non-DOM engines where DOMException is undefined.
 */
export function createAbortError(message = 'Aborted'): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base class for all errors thrown by react-native-fetch-client.
 * Extends the native Error class and adds a discriminant `code` field.
 */

export class FetchNativeError extends Error {
  /** Discriminant code identifying the specific error type. */
  readonly code: ErrorCode;

  /**
   * The resolved request configuration at the time of the error.
   * Authorization header values are redacted to '[REDACTED]'.
   */
  readonly config?: ResolvedRequestConfig;

  constructor(message: string, code: ErrorCode, options?: BaseOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'FetchNativeError';
    this.code = code;
    if (options?.config !== undefined) {
      this.config = options.config;
    }
    // Restore prototype chain broken by extending built-in Error
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// HTTP error (non-2xx response)
// ---------------------------------------------------------------------------

/**
 * Thrown when the server returns a non-2xx HTTP response.
 *
 * This is NOT a network error. The request was successfully sent and a
 * response was received — it just carried an error status code.
 */
export class HttpError extends FetchNativeError {
  /** HTTP status code (e.g. 404, 500). */
  readonly status: number;
  /** HTTP status text (e.g. 'Not Found', 'Internal Server Error'). */
  readonly statusText: string;
  /**
   * Parsed response body, if available and parseable.
   * May be a string, object, or null depending on the response content.
   */
  readonly data: unknown;
  /** Response headers from the server. Keys are normalized to lowercase. */
  readonly headers: Record<string, string>;
  /**
   * The original Fetch Response object.
   * Do not log this directly — it may contain sensitive header values.
   */
  readonly response: Response;

  constructor(
    message: string,
    options: {
      status: number;
      statusText: string;
      data: unknown;
      headers: Record<string, string>;
      response: Response;
      config?: ResolvedRequestConfig;
    },
  ) {
    super(message, 'HTTP_ERROR', buildOptions({ config: options.config }));
    this.name = 'HttpError';
    this.status = options.status;
    this.statusText = options.statusText;
    this.data = options.data;
    this.headers = options.headers;
    this.response = options.response;
  }
}

// ---------------------------------------------------------------------------
// Network error (fetch() rejected with no response)
// ---------------------------------------------------------------------------

/**
 * Thrown when fetch() rejects before any response is received.
 * This represents a true network failure: DNS failure, connection refused,
 * offline, CORS preflight failure, etc.
 *
 * Distinct from HttpError: no HTTP response was received.
 */
export class NetworkError extends FetchNativeError {
  constructor(message: string, options?: { config?: ResolvedRequestConfig; cause?: unknown }) {
    super(message, 'NETWORK_ERROR', options !== undefined ? buildOptions(options) : undefined);
    this.name = 'NetworkError';
  }
}

// ---------------------------------------------------------------------------
// Timeout error
// ---------------------------------------------------------------------------

/**
 * Thrown when a request exceeds the configured timeout.
 * The request was aborted — no response was received.
 *
 * Note: This is a distinct class from NetworkError, even though both represent
 * cases where no HTTP response was received. Callers can distinguish them with
 * `instanceof` or the `.code` field ('TIMEOUT' vs 'NETWORK_ERROR').
 */
export class TimeoutError extends FetchNativeError {
  /** The timeout that was exceeded, in milliseconds. */
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: { config?: ResolvedRequestConfig; cause?: unknown }) {
    super(
      `Request timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      options !== undefined ? buildOptions(options) : undefined,
    );
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Cancel error
// ---------------------------------------------------------------------------

/**
 * Thrown when a request is cancelled via an AbortSignal provided by the caller.
 *
 * Note: Timeout cancellations throw TimeoutError, not CancelError.
 * CancelError is only for caller-initiated cancellation.
 */
export class CancelError extends FetchNativeError {
  constructor(options?: { config?: ResolvedRequestConfig; cause?: unknown }) {
    super(
      'Request was cancelled',
      'CANCELLED',
      options !== undefined ? buildOptions(options) : undefined,
    );
    this.name = 'CancelError';
  }
}

// ---------------------------------------------------------------------------
// Parse error
// ---------------------------------------------------------------------------

/**
 * Thrown when a response body cannot be parsed as the expected type.
 * The HTTP request succeeded (2xx), but the body was malformed.
 */
export class ParseError extends FetchNativeError {
  /** HTTP status code of the response whose body could not be parsed. */
  readonly status: number;
  /** The raw response body text that failed to parse, if retrievable. */
  readonly rawBody: string | null;

  constructor(
    message: string,
    options: {
      status: number;
      rawBody: string | null;
      config?: ResolvedRequestConfig;
      cause?: unknown;
    },
  ) {
    super(message, 'PARSE_ERROR', buildOptions({ config: options.config, cause: options.cause }));
    this.name = 'ParseError';
    this.status = options.status;
    this.rawBody = options.rawBody;
  }
}

// ---------------------------------------------------------------------------
// Config error
// ---------------------------------------------------------------------------

/**
 * Thrown when a request cannot be dispatched due to invalid configuration.
 * Examples: missing URL, invalid base URL, conflicting options.
 */
export class ConfigError extends FetchNativeError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(
      message,
      'CONFIG_ERROR',
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'ConfigError';
  }
}

// ---------------------------------------------------------------------------
// Retry exhausted error
// ---------------------------------------------------------------------------

/**
 * Thrown when all retry attempts have been consumed and the last attempt failed.
 * Wraps the last error as `cause` for full diagnostics.
 */
export class RetryExhaustedError extends FetchNativeError {
  /** The total number of attempts made (initial + retries). */
  readonly attempts: number;
  /** The error from the last failed attempt. */
  readonly lastError: unknown;

  constructor(attempts: number, lastError: unknown, options?: { config?: ResolvedRequestConfig }) {
    const cause = lastError instanceof Error ? lastError : undefined;
    super(
      `Request failed after ${attempts} attempt${attempts === 1 ? '' : 's'}`,
      'RETRY_EXHAUSTED',
      buildOptions({ config: options?.config, cause }),
    );
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// ---------------------------------------------------------------------------
// Validation error
// ---------------------------------------------------------------------------

/**
 * Thrown when response data fails schema validation (e.g. via Zod, Standard Schema,
 * or a custom functional validator).
 */
export class ValidationError extends FetchNativeError {
  /** The raw unvalidated data returned by the server. */
  readonly data: unknown;
  /** Detailed validation issue objects or messages if provided by the validator. */
  readonly issues?: unknown;

  constructor(
    message: string,
    options?: {
      data?: unknown;
      issues?: unknown;
      config?: ResolvedRequestConfig;
      cause?: unknown;
    },
  ) {
    super(message, 'VALIDATION_ERROR', options !== undefined ? buildOptions(options) : undefined);
    this.name = 'ValidationError';
    this.data = options?.data;
    if (options?.issues !== undefined) {
      this.issues = options.issues;
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker error
// ---------------------------------------------------------------------------

/**
 * Thrown when a request is short-circuited because the circuit breaker is currently OPEN
 * due to consecutive upstream failures.
 */
export class CircuitBreakerError extends FetchNativeError {
  /** Current state of the circuit breaker at the moment of the rejection ('OPEN' | 'HALF_OPEN'). */
  readonly state: 'OPEN' | 'HALF_OPEN';
  /** Configured cooldown period before canary trial in milliseconds. */
  readonly resetTimeoutMs: number;

  constructor(
    message: string,
    options: {
      state: 'OPEN' | 'HALF_OPEN';
      resetTimeoutMs: number;
      config?: ResolvedRequestConfig;
      cause?: unknown;
    },
  ) {
    super(message, 'CIRCUIT_OPEN', buildOptions(options));
    this.name = 'CircuitBreakerError';
    this.state = options.state;
    this.resetTimeoutMs = options.resetTimeoutMs;
  }
}

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/** Returns true if `err` is any react-native-fetch-client error. */
export function isFetchNativeError(err: unknown): err is FetchNativeError {
  return err instanceof FetchNativeError;
}

/** Returns true if `err` is an HttpError (non-2xx response received). */
export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}

/** Returns true if `err` is a NetworkError (no response received). */
export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

/** Returns true if `err` is a TimeoutError. */
export function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof TimeoutError;
}

/** Returns true if `err` is a CancelError (caller-initiated cancellation). */
export function isCancelError(err: unknown): err is CancelError {
  return err instanceof CancelError;
}

/** Returns true if `err` is a RetryExhaustedError. */
export function isRetryExhaustedError(err: unknown): err is RetryExhaustedError {
  return err instanceof RetryExhaustedError;
}

/** Returns true if `err` is a ValidationError. */
export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}

/** Returns true if `err` is a CircuitBreakerError. */
export function isCircuitBreakerError(err: unknown): err is CircuitBreakerError {
  return err instanceof CircuitBreakerError;
}

/**
 * Thrown when `api.waitFor()` is terminated early because the `stopIf` predicate returned true.
 * Contains the terminal `HttpResponse` that triggered the abort.
 */
export class WaitForAbortedError<T = unknown> extends FetchNativeError {
  /** The terminal response that matched the stopIf condition. */
  readonly response: HttpResponse<T>;

  constructor(
    response: HttpResponse<T>,
    message = 'Waiting was aborted because the stopIf condition was met',
    options?: { config?: ResolvedRequestConfig; cause?: unknown },
  ) {
    super(message, 'WAIT_FOR_ABORTED', options ? buildOptions(options) : undefined);
    this.name = 'WaitForAbortedError';
    this.response = response;
  }
}

/** Returns true if `err` is a WaitForAbortedError. */
export function isWaitForAbortedError(err: unknown): err is WaitForAbortedError {
  return err instanceof WaitForAbortedError;
}

/**
 * Thrown when an automated authentication token refresh attempt fails.
 * Wraps the underlying error that caused the refresh failure in its `.cause` and `.originalError` properties.
 */
export class AuthRefreshError extends FetchNativeError {
  readonly originalError: unknown;

  constructor(originalError: unknown, options?: { config?: ResolvedRequestConfig }) {
    const errorMsg = originalError instanceof Error ? originalError.message : String(originalError);
    super(
      `Authentication refresh failed: ${errorMsg}`,
      'AUTH_REFRESH_FAILED',
      buildOptions({
        config: options?.config,
        cause: originalError,
      }),
    );
    this.name = 'AuthRefreshError';
    this.originalError = originalError;
  }
}

/** Returns true if `err` is an AuthRefreshError. */
export function isAuthRefreshError(err: unknown): err is AuthRefreshError {
  return err instanceof AuthRefreshError;
}
