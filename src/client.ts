/**
 * Main HTTP Client Factory for react-native-fetch-client.
 *

 * Provides a modern, Fetch-native HTTP client instance with:
 * - Axios-like convenience methods (`.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.request()`)
 * - Safe error handling (`.safe.get()`, `.safe.post()`, etc.) returning `[data, error]` tuples
 * - Native AI / SSE streaming (`.stream()`) using WHATWG ReadableStream and AsyncGenerator
 * - File and FormData upload helper (`.upload()`) with progress tracking
 * - Interceptors for requests and responses
 * - Pluggable in-memory caching and deduplication
 * - Concurrency throttling and Circuit Breaker resiliency
 *
 * @module client
 */

import { executeRequest } from './executor.js';
import { AuthManager } from './auth.js';
import { DedupManager } from './dedup.js';
import { CacheManager } from './cache.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ConcurrencyLimiter } from './concurrency.js';
import { parseSseStream } from './stream.js';
import { DefaultInterceptorManager } from './interceptor.js';
import { createPaginateHelper } from './paginate.js';
import {
  isFetchNativeError,
  NetworkError,
  ConfigError,
  TimeoutError,
  CancelError,
  HttpError,
  WaitForAbortedError,
} from './errors.js';
import type {
  ClientConfig,
  HttpClient,
  RequestConfig,
  HttpMethod,
  HttpResponse,
  SafeResult,
  SafeHttpClient,
  StreamEvent,
  StreamOptions,
  UploadFileSource,
  UploadOptions,
  PollOptions,
  WaitForOptions,
} from './types.js';

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const toError = (reason: unknown): Error =>
    reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : 'Aborted');

  if (signal?.aborted) {
    return Promise.reject(toError(signal.reason));
  }
  if (ms <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let onAbort: (() => void) | undefined;

    const timerId = setTimeout(() => {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    if (signal) {
      onAbort = () => {
        clearTimeout(timerId);
        if (onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
        reject(toError(signal.reason));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Creates and configures a new `HttpClient` instance.
 *
 * @param config Optional client-level configuration defaults.
 * @returns An initialized `HttpClient` instance.
 *
 * @example
 * ```ts
 * import { createClient } from 'react-native-fetch-client';
 *

 * const api = createClient({
 *   baseURL: 'https://api.example.com/v1',
 *   timeout: 10000,
 *   bearerToken: 'my-jwt-token',
 *   retry: { attempts: 3 },
 * });
 *
 * // Standard request
 * const res = await api.get('/users/123');
 * console.log(res.data);
 *
 * // Safe request without try/catch
 * const [user, error] = await api.safe.get('/users/123');
 * if (error) {
 *   console.error('Request failed:', error.message);
 * }
 * ```
 */
export function createClient(config: ClientConfig = {}): HttpClient {
  const clientConfig = { ...config };
  const authManager = new AuthManager(config.auth);
  const dedupManager = new DedupManager();
  const cacheManager = new CacheManager(config.cache);
  const cancelGroups = new Map<string, AbortController>();

  const circuitBreaker =
    config.circuitBreaker && config.circuitBreaker.enabled !== false
      ? new CircuitBreaker(config.circuitBreaker)
      : undefined;

  const concurrencyLimiter =
    config.maxConcurrentRequests !== undefined && config.maxConcurrentRequests > 0
      ? new ConcurrencyLimiter(config.maxConcurrentRequests)
      : undefined;

  const requestInterceptors = new DefaultInterceptorManager<RequestConfig>();
  const responseInterceptors = new DefaultInterceptorManager<HttpResponse<unknown>>();

  /**
   * Primary request dispatcher executing interceptors and the core pipeline.
   */
  const request = async <T = unknown>(
    reqConfig: RequestConfig & { url: string; method: HttpMethod },
  ): Promise<HttpResponse<T>> => {
    let currentConfig: RequestConfig & { url: string; method: HttpMethod } = { ...reqConfig };

    // Request interceptors execute in registration order
    for (const interceptor of requestInterceptors.getInterceptors()) {
      try {
        currentConfig = (await interceptor.fulfilled(currentConfig)) as RequestConfig & {
          url: string;
          method: HttpMethod;
        };
      } catch (err: unknown) {
        if (interceptor.rejected) {
          currentConfig = (await interceptor.rejected(err)) as RequestConfig & {
            url: string;
            method: HttpMethod;
          };
        } else {
          throw err;
        }
      }
    }

    let response: HttpResponse<T>;
    try {
      response = await executeRequest<T>(
        currentConfig,
        clientConfig,
        authManager,
        dedupManager,
        cacheManager,
        circuitBreaker,
        concurrencyLimiter,
        cancelGroups,
      );
    } catch (err: unknown) {
      let currentError: unknown = err;
      for (const interceptor of responseInterceptors.getInterceptors()) {
        if (interceptor.rejected) {
          try {
            const recovered = await interceptor.rejected(currentError);
            return recovered as HttpResponse<T>;
          } catch (rejectedErr: unknown) {
            currentError = rejectedErr;
          }
        }
      }
      throw currentError;
    }

    let currentResponse: HttpResponse<unknown> = response;
    for (const interceptor of responseInterceptors.getInterceptors()) {
      try {
        currentResponse = await interceptor.fulfilled(currentResponse);
      } catch (err: unknown) {
        if (interceptor.rejected) {
          currentResponse = (await interceptor.rejected(err)) as HttpResponse<unknown>;
        } else {
          throw err;
        }
      }
    }

    const shouldUnwrap = currentConfig.unwrap ?? clientConfig.unwrap ?? false;
    if (shouldUnwrap) {
      return (currentResponse as HttpResponse<T>).data as unknown as HttpResponse<T>;
    }

    return currentResponse as HttpResponse<T>;
  };

  /**
   * Executes a request safely, returning a Go/Rust style `[data, error]` tuple instead of throwing.
   */
  const safeRequest = async <T = unknown>(
    reqConfig: RequestConfig & { url: string; method: HttpMethod },
  ): Promise<SafeResult<T>> => {
    try {
      const res = await request<T>({ ...reqConfig, unwrap: false });
      return [res.data, null];
    } catch (err: unknown) {
      const fncError = isFetchNativeError(err)
        ? err
        : new NetworkError(err instanceof Error ? err.message : String(err), { cause: err });
      return [null, fncError];
    }
  };

  /**
   * Safe methods collection.
   */
  const safe: SafeHttpClient = {
    get: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      safeRequest<T>({ ...reqConfig, url, method: 'GET' }),
    post: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'POST',
      };
      if (body !== undefined) merged.body = body;
      return safeRequest<T>(merged);
    },
    put: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'PUT',
      };
      if (body !== undefined) merged.body = body;
      return safeRequest<T>(merged);
    },
    patch: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'PATCH',
      };
      if (body !== undefined) merged.body = body;
      return safeRequest<T>(merged);
    },
    delete: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      safeRequest<T>({ ...reqConfig, url, method: 'DELETE' }),
    del: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      safeRequest<T>({ ...reqConfig, url, method: 'DELETE' }),
    head: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      safeRequest<T>({ ...reqConfig, url, method: 'HEAD' }),
    options: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      safeRequest<T>({ ...reqConfig, url, method: 'OPTIONS' }),
    request: <T = unknown>(reqConfig: RequestConfig & { url: string; method: HttpMethod }) =>
      safeRequest<T>(reqConfig),
  };

  /**
   * Streams Server-Sent Events (SSE) or raw chunk lines via an AsyncGenerator.
   */
  async function* stream(
    url: string,
    options?: StreamOptions,
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const reqConfig: RequestConfig & { url: string; method: HttpMethod } = {
      ...options,
      url,
      method: options?.method ?? 'GET',
      responseType: 'stream',
      unwrap: false,
    };

    const response = await request<ReadableStream<Uint8Array>>(reqConfig);
    if (!response.data || typeof response.data.getReader !== 'function') {
      return;
    }

    yield* parseSseStream(response.data, options);
  }

  /**
   * Upload helper that simplifies file and FormData uploads with automatic boundary handling.
   */
  const upload = async <T = unknown>(
    url: string,
    file: UploadFileSource,
    options?: UploadOptions,
  ): Promise<HttpResponse<T>> => {
    let formData: FormData;
    const fieldName = options?.fieldName ?? 'file';

    if (typeof FormData !== 'undefined' && file instanceof FormData) {
      formData = file;
      if (options?.extraFields) {
        for (const [k, v] of Object.entries(options.extraFields)) {
          formData.append(k, String(v));
        }
      }
    } else if (typeof FormData !== 'undefined') {
      formData = new FormData();
      if (typeof Blob !== 'undefined' && file instanceof Blob) {
        if (options?.fileName) {
          formData.append(fieldName, file, options.fileName);
        } else {
          formData.append(fieldName, file);
        }
      } else if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) {
        const blobPart = ArrayBuffer.isView(file)
          ? new Uint8Array(file.buffer as ArrayBuffer, file.byteOffset, file.byteLength)
          : file;
        const blob = new Blob([blobPart]);
        if (options?.fileName) {
          formData.append(fieldName, blob, options.fileName);
        } else {
          formData.append(fieldName, blob);
        }
      } else if (typeof file === 'object' && file !== null) {
        for (const [k, v] of Object.entries(file)) {
          if (typeof Blob !== 'undefined' && v instanceof Blob) {
            formData.append(k, v);
          } else if (v !== undefined && v !== null) {
            formData.append(k, String(v));
          }
        }
      }

      if (options?.extraFields) {
        for (const [k, v] of Object.entries(options.extraFields)) {
          formData.append(k, String(v));
        }
      }
    } else {
      throw new ConfigError('FormData is not available in this environment');
    }

    const mergedConfig: RequestConfig & { url: string; method: HttpMethod } = {
      ...options,
      url,
      method: options?.method ?? 'POST',
      body: formData,
    };

    return request<T>(mergedConfig);
  };

  const waitFor = async <T = unknown>(
    url: string,
    options: WaitForOptions<T>,
  ): Promise<HttpResponse<T>> => {
    const interval = Math.max(50, options.interval ?? 1000);
    const timeout = options.timeout !== undefined ? Math.max(0, options.timeout) : 30000;
    const backoff = Math.max(1, options.backoff ?? 1);
    const maxInterval =
      options.maxInterval !== undefined ? Math.max(interval, options.maxInterval) : 10000;
    const maxAttempts =
      options.maxAttempts !== undefined && options.maxAttempts > 0 ? options.maxAttempts : Infinity;
    const ignoreErrors = options.ignoreErrors ?? [404];
    const startTime = Date.now();
    let currentInterval = interval;
    let attempt = 0;

    if (options.signal?.aborted) {
      const reason: unknown = options.signal.reason;
      if (reason instanceof CancelError) throw reason;
      throw new CancelError({ cause: reason });
    }

    const createTimeoutError = () =>
      new TimeoutError(timeout, {
        config: {
          url,
          method: options.method ?? 'GET',
          headers: {},
          timeout,
          responseType: options.responseType ?? 'json',
          retry: {
            attempts: 0,
            backoff: 'exponential',
            delay: 0,
            maxDelay: 0,
            jitter: false,
            retryOn: [],
            safeMethods: [],
            respectRetryAfter: false,
          },
        },
      });

    const overallController = new AbortController();
    let overallTimerId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let callerAborted = false;

    if (timeout > 0) {
      overallTimerId = setTimeout(() => {
        timedOut = true;
        overallController.abort(createTimeoutError());
      }, timeout);
    }

    const onCallerAbort = () => {
      callerAborted = true;
      overallController.abort(options.signal?.reason);
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    const cleanup = () => {
      if (overallTimerId !== undefined) {
        clearTimeout(overallTimerId);
        overallTimerId = undefined;
      }
      if (options.signal && onCallerAbort) {
        options.signal.removeEventListener('abort', onCallerAbort);
      }
    };

    try {
      while (true) {
        if (callerAborted || options.signal?.aborted) {
          const reason: unknown = options.signal?.reason;
          if (reason instanceof CancelError) throw reason;
          throw new CancelError({ cause: reason });
        }

        if (timedOut || (timeout > 0 && Date.now() - startTime >= timeout)) {
          throw createTimeoutError();
        }

        if (attempt >= maxAttempts) {
          throw createTimeoutError();
        }

        attempt += 1;
        let res: HttpResponse<T> | undefined;

        try {
          res = await request<T>({
            ...options,
            url,
            method: options.method ?? 'GET',
            signal: overallController.signal,
          });
        } catch (err: unknown) {
          if (timedOut || (timeout > 0 && Date.now() - startTime >= timeout)) {
            throw createTimeoutError();
          }
          if (callerAborted || options.signal?.aborted) {
            const reason: unknown = options.signal?.reason;
            if (reason instanceof CancelError) throw reason;
            throw new CancelError({ cause: reason ?? err });
          }
          if (err instanceof TimeoutError && timedOut) {
            throw createTimeoutError();
          }

          const shouldIgnore =
            ignoreErrors === true ||
            (Array.isArray(ignoreErrors) &&
              err instanceof HttpError &&
              ignoreErrors.includes(err.status));

          if (!shouldIgnore) {
            throw err;
          }
        }

        const elapsed = Date.now() - startTime;
        if (options.onTick) {
          try {
            options.onTick({ attempt, elapsedMs: elapsed, response: res });
          } catch {
            // Safeguard against user tick listener throwing
          }
        }

        if (res) {
          if (options.stopIf) {
            const stopped = await options.stopIf(res);
            if (stopped) {
              throw new WaitForAbortedError(res);
            }
          }

          const matched = await options.until(res);
          if (matched) {
            return res;
          }
        }

        if (timeout > 0 && elapsed >= timeout) {
          throw createTimeoutError();
        }

        if (attempt >= maxAttempts) {
          throw createTimeoutError();
        }

        const remaining = timeout > 0 ? timeout - elapsed : Infinity;
        const waitMs = Math.min(currentInterval, remaining);
        if (waitMs <= 0) {
          throw createTimeoutError();
        }

        try {
          await abortableSleep(waitMs, overallController.signal);
        } catch (sleepErr: unknown) {
          if (timedOut || (timeout > 0 && Date.now() - startTime >= timeout)) {
            throw createTimeoutError();
          }
          if (callerAborted || options.signal?.aborted) {
            const reason: unknown = options.signal?.reason;
            if (reason instanceof CancelError) throw reason;
            throw new CancelError({ cause: reason ?? sleepErr });
          }
          throw sleepErr;
        }

        currentInterval = Math.min(maxInterval, Math.round(currentInterval * backoff));
      }
    } catch (err: unknown) {
      if (
        timedOut ||
        (timeout > 0 && Date.now() - startTime >= timeout && !(err instanceof CancelError))
      ) {
        throw createTimeoutError();
      }
      if (callerAborted || options.signal?.aborted) {
        const reason: unknown = options.signal?.reason;
        if (reason instanceof CancelError) throw reason;
        throw new CancelError({ cause: reason ?? err });
      }
      throw err;
    } finally {
      cleanup();
    }
  };

  const client: HttpClient = {
    request,
    get: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      request<T>({ ...reqConfig, url, method: 'GET' }),
    post: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'POST',
      };
      if (body !== undefined) merged.body = body;
      return request<T>(merged);
    },
    put: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'PUT',
      };
      if (body !== undefined) merged.body = body;
      return request<T>(merged);
    },
    patch: <T = unknown>(url: string, body?: RequestConfig['body'], reqConfig?: RequestConfig) => {
      const merged: RequestConfig & { url: string; method: HttpMethod } = {
        ...reqConfig,
        url,
        method: 'PATCH',
      };
      if (body !== undefined) merged.body = body;
      return request<T>(merged);
    },
    delete: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      request<T>({ ...reqConfig, url, method: 'DELETE' }),
    del: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      request<T>({ ...reqConfig, url, method: 'DELETE' }),
    head: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      request<T>({ ...reqConfig, url, method: 'HEAD' }),
    options: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
      request<T>({ ...reqConfig, url, method: 'OPTIONS' }),
    safe,
    stream,
    upload,
    poll: <T = unknown>(url: string, options: PollOptions<T>): Promise<HttpResponse<T>> =>
      waitFor<T>(url, {
        ignoreErrors: [],
        maxInterval: Infinity,
        ...options,
      }),
    waitFor,
    paginate: createPaginateHelper({
      get: <T = unknown>(url: string, reqConfig?: RequestConfig) =>
        request<T>({ ...reqConfig, url, method: 'GET' }),
    }),
    cache: cacheManager,
    ...(circuitBreaker ? { circuitBreaker } : {}),
    interceptors: {
      request: requestInterceptors,
      response: responseInterceptors,
    },
  };

  return client;
}
