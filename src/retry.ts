import {
  HttpError,
  NetworkError,
  TimeoutError,
  CancelError,
  ConfigError,
  ParseError,
  createAbortError,
} from './errors.js';
import type { ResolvedRequestConfig, ResolvedRetryPolicy, RetryPolicy } from './types.js';

/** Default retry policy applied when retry is enabled without specific overrides. */
export const DEFAULT_RETRY_POLICY: ResolvedRetryPolicy = {
  attempts: 0,
  backoff: 'exponential',
  delay: 1000,
  maxDelay: 30000,
  jitter: true,
  retryOn: [429, 500, 502, 503, 504],
  safeMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
  respectRetryAfter: true,
};

/**
 * Merges client-level and per-request retry policies into a single ResolvedRetryPolicy.
 */
export function resolveRetryPolicy(
  clientRetry?: Partial<RetryPolicy> | false,
  requestRetry?: Partial<RetryPolicy> | false,
): ResolvedRetryPolicy {
  if (requestRetry === false) {
    return { ...DEFAULT_RETRY_POLICY, attempts: 0 };
  }

  const base =
    clientRetry === false
      ? { ...DEFAULT_RETRY_POLICY, attempts: 0 }
      : { ...DEFAULT_RETRY_POLICY, ...clientRetry };
  const merged = { ...base, ...requestRetry };

  const resolved: ResolvedRetryPolicy = {
    attempts: Math.max(0, merged.attempts ?? 0),
    backoff: merged.backoff ?? 'exponential',
    delay: Math.max(0, merged.delay ?? 1000),
    maxDelay: Math.max(0, merged.maxDelay ?? 30000),
    jitter: merged.jitter ?? true,
    retryOn: merged.retryOn ?? [429, 500, 502, 503, 504],
    safeMethods: merged.safeMethods ?? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'],
    respectRetryAfter: merged.respectRetryAfter ?? true,
  };

  if (merged.retryCondition !== undefined) {
    resolved.retryCondition = merged.retryCondition;
  }

  return resolved;
}

/**
 * Parses the HTTP Retry-After response header into milliseconds.
 * Supports both delay-seconds (e.g. "120") and HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT").
 * Returns null if the header is missing, malformed, or represents a past date.
 */
export function parseRetryAfter(headerValue?: string | null): number | null {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }

  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    return null;
  }

  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return Math.max(0, diff);
  }

  return null;
}

/**
 * Calculates backoff delay in milliseconds for a given retry attempt.
 * Respects Retry-After header if enabled and present, applies exponential or linear backoff,
 * caps at maxDelay, and adds optional jitter.
 */
export function calculateRetryDelay(
  attempt: number,
  policy: ResolvedRetryPolicy,
  error?: unknown,
  randomFn: () => number = Math.random,
): number {
  if (policy.respectRetryAfter && error instanceof HttpError) {
    const retryAfterHeader = error.headers['retry-after'];
    const parsed = parseRetryAfter(retryAfterHeader);
    if (parsed !== null) {
      return Math.min(parsed, policy.maxDelay);
    }
  }

  const normalizedAttempt = Math.max(1, attempt);
  let delay: number;

  if (policy.backoff === 'linear') {
    delay = policy.delay * normalizedAttempt;
  } else {
    delay = policy.delay * Math.pow(2, normalizedAttempt - 1);
  }

  delay = Math.min(delay, policy.maxDelay);

  if (policy.jitter) {
    delay = Math.floor(randomFn() * delay);
  }

  return Math.max(0, delay);
}

/**
 * Evaluates whether an error and attempt should trigger a retry.
 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  config: ResolvedRequestConfig,
): boolean {
  if (attempt > config.retry.attempts) {
    return false;
  }

  if (!config.retry.safeMethods.includes(config.method)) {
    return false;
  }

  // Non-retryable error types
  if (error instanceof CancelError) {
    return false;
  }
  if (error instanceof ConfigError) {
    return false;
  }
  if (error instanceof ParseError) {
    return false;
  }
  if (error instanceof TimeoutError) {
    // Total request timeout expired — do not retry
    return false;
  }

  // Custom condition predicate takes precedence if defined
  if (typeof config.retry.retryCondition === 'function') {
    return config.retry.retryCondition(error, attempt);
  }

  // Functional retryOn takes precedence if provided
  if (typeof config.retry.retryOn === 'function') {
    return config.retry.retryOn(error, attempt);
  }

  // Status code matching for HttpError
  if (error instanceof HttpError) {
    if (Array.isArray(config.retry.retryOn)) {
      return config.retry.retryOn.includes(error.status);
    }
    return false;
  }

  // NetworkError (connection dropped, DNS failure, aborted network) is retried by default
  if (error instanceof NetworkError) {
    return true;
  }

  return false;
}

/**
 * Cancellation-aware async sleep utility.
 * Immediately rejects if the signal is already aborted or aborts while waiting.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    const reason: unknown = signal.reason;
    if (reason instanceof Error) {
      return Promise.reject(reason);
    }
    return Promise.reject(createAbortError());
  }

  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    function onAbort(): void {
      clearTimeout(timerId);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      const reason: unknown = signal?.reason;
      if (reason instanceof Error) {
        reject(reason);
      } else {
        reject(createAbortError());
      }
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const timerId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}
