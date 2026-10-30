import {
  HttpError,
  NetworkError,
  ConfigError,
  TimeoutError,
  CancelError,
  RetryExhaustedError,
  ParseError,
  ValidationError,
  AuthRefreshError,
  createAbortError,
} from './errors.js';
import { buildUrl, isAbsoluteUrl, isSameOrigin } from './url.js';
import { mergeHeaders } from './headers.js';
import { serializeBody } from './serialize.js';
import { parseResponse } from './parse.js';
import { resolveRetryPolicy, shouldRetry, calculateRetryDelay, sleep } from './retry.js';
import { generateDedupKey, isDedupEligible, type DedupManager } from './dedup.js';
import { generateCacheKey, isCacheEligible, type CacheManager } from './cache.js';
import { validateData } from './validator.js';
import type { ConcurrencyLimiter } from './concurrency.js';
import type { AuthManager } from './auth.js';
import type {
  InternalRequestConfig,
  ClientConfig,
  ResolvedRequestConfig,
  HttpResponse,
  ProgressEvent,
  SchemaValidator,
  DebugLogEntry,
} from './types.js';

async function dispatchFetch<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | null | undefined,
  credentials: RequestCredentials | undefined,
  redirect: RequestRedirect | undefined,
  dispatcher: unknown,
  responseType: ResolvedRequestConfig['responseType'],
  resolvedConfig: ResolvedRequestConfig,
  fetchImpl: typeof globalThis.fetch,
  signal: AbortSignal,
  onDownloadProgress?: (event: ProgressEvent) => void,
): Promise<HttpResponse<T>> {
  const reqInit: RequestInit = {
    method,
    headers,
  };
  if (body !== null && body !== undefined) {
    reqInit.body = body;
  }
  if (credentials !== undefined) {
    reqInit.credentials = credentials;
  }
  if (redirect !== undefined) {
    reqInit.redirect = redirect;
  }
  if (dispatcher !== undefined) {
    (reqInit as Record<string, unknown>).dispatcher = dispatcher;
  }
  reqInit.signal = signal;

  let requestObj: Request;
  try {
    requestObj = new Request(url, reqInit);
  } catch {
    const fallbackUrl = /^https?:\/\//i.test(url)
      ? url
      : `http://localhost${url.startsWith('/') ? '' : '/'}${url}`;
    requestObj = new Request(fallbackUrl, reqInit);
  }

  const getAbortError = (): Error => {
    const reason: unknown = signal.reason;
    if (reason instanceof Error) return reason;
    return createAbortError();
  };

  let abortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(getAbortError());
      return;
    }
    abortListener = () => {
      reject(getAbortError());
    };
    signal.addEventListener('abort', abortListener, { once: true });
  });

  let response: Response;
  try {
    response = await Promise.race([fetchImpl(requestObj, reqInit), abortPromise]);
  } catch (err: unknown) {
    if (err instanceof TimeoutError) throw err;
    if (err instanceof CancelError) throw err;
    if ((err instanceof Error && err.name === 'AbortError') || signal.aborted) {
      const reason: unknown = signal.reason;
      if (reason instanceof TimeoutError) throw reason;
      if (reason instanceof CancelError) throw reason;
      throw new CancelError({ config: resolvedConfig, cause: reason ?? err });
    }
    const msg = err instanceof Error ? err.message : 'Network request failed';
    throw new NetworkError(msg, { config: resolvedConfig, cause: err });
  } finally {
    if (abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
  }

  const resHeaders: Record<string, string> = {};
  response.headers.forEach((val, key) => {
    resHeaders[key.toLowerCase()] = val;
  });

  // Handle 304 Not Modified for conditional GET (RFC 7234)
  if (response.status === 304) {
    return {
      data: null as unknown as T,
      status: 304,
      statusText: response.statusText,
      headers: resHeaders,
      config: resolvedConfig,
      cached: true,
      fromDedup: false,
      request: requestObj,
    };
  }

  if (!response.ok) {
    let clonedResponse: Response | undefined;
    try {
      clonedResponse = response.clone();
    } catch {
      // Safe fallback for environments/streams where clone() is unsupported
    }
    const errorData = await parseResponse(response, responseType, resolvedConfig).catch(() => null);
    throw new HttpError(`HTTP Error ${response.status} ${response.statusText}`, {
      status: response.status,
      statusText: response.statusText,
      data: errorData,
      headers: resHeaders,
      response: clonedResponse ?? response,
      config: resolvedConfig,
    });
  }

  const data = (await parseResponse(
    response,
    responseType,
    resolvedConfig,
    onDownloadProgress,
  )) as T;

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
    config: resolvedConfig,
    cached: false,
    fromDedup: false,
    request: requestObj,
  };
}

export async function executeRequest<T = unknown>(
  config: InternalRequestConfig,
  clientConfig: ClientConfig = {},
  authManager?: AuthManager,
  dedupManager?: DedupManager,
  cacheManager?: CacheManager,
  concurrencyLimiter?: ConcurrencyLimiter,
  cancelGroups?: Map<string, AbortController>,
): Promise<HttpResponse<T>> {
  const activeGroups = cancelGroups ?? new Map<string, AbortController>();

  // 0. Auto-cancel previous in-flight request in the same cancellation group
  let groupController: AbortController | undefined;
  let groupKey: string | undefined;
  if (
    config.cancelPrevious &&
    !config._isFromConcurrency &&
    !config._isFromDedup &&
    !config._isRefreshed
  ) {
    groupKey = config.cancelPrevious;
    const existing = activeGroups.get(groupKey);
    if (existing) {
      existing.abort(
        new CancelError({
          cause: new Error(
            `Request canceled because a newer request was dispatched in group '${groupKey}'`,
          ),
        }),
      );
    }
    groupController = new AbortController();
    activeGroups.set(groupKey, groupController);

    if (config.signal) {
      if (config.signal.aborted) {
        groupController.abort(config.signal.reason);
      } else {
        config.signal.addEventListener(
          'abort',
          () => groupController?.abort(config.signal?.reason),
          {
            once: true,
          },
        );
      }
    }

    config = {
      ...config,
      signal: groupController.signal,
    };
  }

  const cleanupGroup = (): void => {
    if (groupKey && groupController && activeGroups.get(groupKey) === groupController) {
      activeGroups.delete(groupKey);
    }
  };

  try {
    return await executeRequestInternal<T>(
      config,
      clientConfig,
      authManager,
      dedupManager,
      cacheManager,
      concurrencyLimiter,
      activeGroups,
    );
  } finally {
    cleanupGroup();
  }
}

async function executeRequestInternal<T = unknown>(
  config: InternalRequestConfig,
  clientConfig: ClientConfig = {},
  authManager?: AuthManager,
  dedupManager?: DedupManager,
  cacheManager?: CacheManager,
  concurrencyLimiter?: ConcurrencyLimiter,
  cancelGroups?: Map<string, AbortController>,
): Promise<HttpResponse<T>> {
  // 1. Client concurrency throttling
  if (concurrencyLimiter && !config._isFromConcurrency) {
    return concurrencyLimiter.run(
      () =>
        executeRequest<T>(
          { ...config, _isFromConcurrency: true },
          clientConfig,
          authManager,
          dedupManager,
          cacheManager,
          concurrencyLimiter,
          cancelGroups,
        ),
      config.signal,
    );
  }

  const startTime = Date.now();
  const urlStr = config.url ?? '';
  const method = config.method ?? 'GET';
  const baseURL = config.baseURL ?? config.baseUrl ?? clientConfig.baseURL ?? clientConfig.baseUrl;
  const params = { ...clientConfig.params, ...config.params };
  const pathParams = config.pathParams;

  // 2. Build URL with path params interpolation
  const resolvedUrl = buildUrl(
    urlStr,
    baseURL,
    params,
    pathParams && Object.keys(pathParams).length > 0 ? pathParams : undefined,
  );
  if (!resolvedUrl) {
    throw new ConfigError('URL is required');
  }

  const baseHeaders = mergeHeaders(clientConfig.headers, config.headers);

  // 3. Bearer Token preset auto-injection & AuthManager (with cross-origin protection)
  const allowCrossOrigin =
    (typeof config.auth === 'object' && config.auth?.allowCrossOrigin) ||
    Boolean(clientConfig.auth?.allowCrossOrigin);

  const isRequestLevelAuth =
    config.bearerToken !== undefined || (typeof config.auth === 'object' && config.auth !== null);

  let isCrossOrigin = false;
  if (isAbsoluteUrl(resolvedUrl)) {
    if (baseURL && isAbsoluteUrl(baseURL)) {
      isCrossOrigin = !isSameOrigin(baseURL, resolvedUrl);
    } else if (!baseURL) {
      const trustedOrigin = (clientConfig as { _trustedOrigin?: string })._trustedOrigin;
      if (trustedOrigin) {
        isCrossOrigin = !isSameOrigin(trustedOrigin, resolvedUrl);
      } else if (!isRequestLevelAuth) {
        try {
          (clientConfig as { _trustedOrigin?: string })._trustedOrigin = new URL(
            resolvedUrl,
          ).origin;
        } catch {
          // Ignore URL parse error
        }
      }
    }
  }

  const shouldAttachAuth = !isCrossOrigin || allowCrossOrigin;

  if (shouldAttachAuth) {
    const bearerSource = config.bearerToken ?? clientConfig.bearerToken;
    if (bearerSource && !baseHeaders['authorization'] && !baseHeaders['Authorization']) {
      const tokenVal = typeof bearerSource === 'function' ? await bearerSource() : bearerSource;
      if (tokenVal) {
        baseHeaders['authorization'] = `Bearer ${tokenVal}`;
      }
    }

    if (authManager) {
      await authManager.attachToken(baseHeaders, resolvedUrl, config.auth, config._isRefreshed);
    }
  }

  const responseType = config.responseType ?? clientConfig.responseType ?? 'json';

  // 4. Check cache for eligible safe requests + RFC 7234 conditional validation
  const cacheEligible =
    cacheManager !== undefined &&
    isCacheEligible(method, baseHeaders, config.cache, clientConfig.cache);

  const cacheKey = cacheEligible
    ? generateCacheKey(
        method,
        resolvedUrl,
        baseHeaders,
        clientConfig.cache?.allowAuthenticated,
        responseType,
      )
    : '';

  if (cacheEligible && cacheManager) {
    if (typeof cacheManager.ready === 'function') {
      await cacheManager.ready();
    }
    const cachedEntry = cacheManager.getEntry<T>(cacheKey);
    const etagEnabled =
      typeof config.cache === 'object' && config.cache.etag !== undefined
        ? config.cache.etag
        : (clientConfig.cache?.etag ?? true);

    if (cachedEntry) {
      const isFresh = Date.now() <= cachedEntry.expiresAt;
      const forceRevalidate = typeof config.cache === 'object' && config.cache.etag === true;
      const strategy =
        (typeof config.cache === 'object' && config.cache.strategy) ||
        clientConfig.cache?.strategy ||
        clientConfig.cache?.defaultStrategy ||
        'cache-first';

      if (isFresh && !forceRevalidate) {
        const cachedResponse = cacheManager.get<T>(cacheKey);
        if (cachedResponse !== undefined) {
          cachedResponse.durationMs = Date.now() - startTime;
          return cachedResponse;
        }
      }

      // Stale-While-Revalidate (SWR): Return stale response instantly, revalidate in background
      if (strategy === 'stale-while-revalidate' && !config._isRevalidating) {
        const staleResponse = cacheManager.get<T>(cacheKey, { allowStale: true });
        if (staleResponse !== undefined) {
          staleResponse.durationMs = Date.now() - startTime;
          const revalidateConfig: InternalRequestConfig = {
            ...config,
            _isRevalidating: true,
          };
          void executeRequest<T>(
            revalidateConfig,
            clientConfig,
            authManager,
            dedupManager,
            cacheManager,
            concurrencyLimiter,
            cancelGroups,
          )
            .then((freshRes) => {
              const onRevalidated =
                (typeof config.cache === 'object' && config.cache?.onRevalidated) ||
                config.onRevalidated;
              if (onRevalidated) {
                onRevalidated(freshRes);
              }
            })
            .catch((err: unknown) => {
              const onRevalidationError =
                (typeof config.cache === 'object' && config.cache?.onRevalidationError) ||
                config.onRevalidationError;
              if (onRevalidationError) {
                onRevalidationError(err);
              }
            });

          return staleResponse;
        }
      }

      // Attach RFC 7234 conditional validation headers
      if (etagEnabled) {
        if (cachedEntry.etag && !baseHeaders['if-none-match']) {
          baseHeaders['if-none-match'] = cachedEntry.etag;
        }
        if (cachedEntry.lastModified && !baseHeaders['if-modified-since']) {
          baseHeaders['if-modified-since'] = cachedEntry.lastModified;
        }
      }
    }
  }

  // 5. Deduplicate safe in-flight requests if eligible
  if (
    dedupManager &&
    !config._isFromDedup &&
    isDedupEligible(method, config.dedup, clientConfig.dedup)
  ) {
    const credentials = config.credentials ?? clientConfig.credentials;
    const dedupKey = generateDedupKey(
      method,
      resolvedUrl,
      baseHeaders,
      credentials,
      config.body,
      responseType,
    );

    return dedupManager.execute<T>(
      dedupKey,
      (sharedSignal) => {
        return executeRequest<T>(
          { ...config, signal: sharedSignal, _isFromDedup: true },
          clientConfig,
          authManager,
          dedupManager,
          cacheManager,
          concurrencyLimiter,
          cancelGroups,
        );
      },
      config.signal,
    );
  }

  const formUrlEncoded = config.formUrlEncoded ?? clientConfig.formUrlEncoded;
  const { body, contentType } = serializeBody(config.body, baseHeaders, formUrlEncoded);

  if (contentType && !baseHeaders['content-type']) {
    baseHeaders['content-type'] = contentType;
  }
  if (typeof FormData !== 'undefined' && config.body instanceof FormData) {
    delete baseHeaders['content-type'];
  }

  const timeout = config.timeout ?? clientConfig.timeout ?? 0;
  const credentials = config.credentials ?? clientConfig.credentials;
  const redirect = config.redirect ?? clientConfig.redirect;
  const dispatcher = config.dispatcher ?? clientConfig.dispatcher;
  const onDownloadProgress = config.onDownloadProgress ?? clientConfig.onDownloadProgress;
  const onUploadProgress = config.onUploadProgress ?? clientConfig.onUploadProgress;
  const fetchImpl = config.fetchImpl ?? clientConfig.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new ConfigError(
      'globalThis.fetch is not available in this environment. ' +
        'react-native-fetch-client requires Node.js >= 18.0.0, a modern browser, or React Native. ' +
        'If you are running on Node.js 14 or 16, please upgrade to Node.js >= 18 or provide a fetch polyfill via the `fetchImpl` option (e.g. `createClient({ fetchImpl: nodeFetch })`).',
    );
  }

  const resolvedRetry = resolveRetryPolicy(clientConfig.retry, config.retry);

  const resolvedConfig: ResolvedRequestConfig = {
    url: resolvedUrl,
    method,
    headers: { ...baseHeaders },
    timeout,
    responseType,
    retry: resolvedRetry,
  };

  if (config.signal) {
    resolvedConfig.signal = config.signal;
  }

  if (Object.keys(params).length > 0) {
    resolvedConfig.params = params;
  }
  if (pathParams && Object.keys(pathParams).length > 0) {
    resolvedConfig.pathParams = pathParams;
  }
  if (credentials !== undefined) {
    resolvedConfig.credentials = credentials;
  }

  const SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'proxy-authorization',
    'x-api-key',
    'x-auth-token',
  ];
  const authHeaderKey = authManager ? authManager.getHeaderName().toLowerCase() : 'authorization';
  if (resolvedConfig.headers[authHeaderKey]) {
    resolvedConfig.headers[authHeaderKey] = '[REDACTED]';
  }
  for (const key of Object.keys(resolvedConfig.headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      resolvedConfig.headers[key] = '[REDACTED]';
    }
  }

  let totalTimerId: ReturnType<typeof setTimeout> | undefined;
  let onCallerAbort: (() => void) | undefined;
  const totalController = new AbortController();

  if (timeout > 0) {
    totalTimerId = setTimeout(() => {
      totalController.abort(new TimeoutError(timeout, { config: resolvedConfig }));
    }, timeout);
  }

  if (config.signal) {
    if (config.signal.aborted) {
      const reason: unknown = config.signal.reason;
      if (reason instanceof CancelError) throw reason;
      throw new CancelError({ config: resolvedConfig, cause: reason });
    }
    onCallerAbort = () => {
      const reason: unknown = config.signal?.reason;
      totalController.abort(
        reason instanceof Error
          ? reason
          : new CancelError({ config: resolvedConfig, cause: reason }),
      );
    };
    config.signal.addEventListener('abort', onCallerAbort);
  }

  const cleanup = () => {
    if (totalTimerId !== undefined) {
      clearTimeout(totalTimerId);
    }
    if (onCallerAbort && config.signal) {
      config.signal.removeEventListener('abort', onCallerAbort);
    }
  };

  // If onUploadProgress is specified, compute size and emit initial start progress (0%)
  let uploadSize = 0;
  if (onUploadProgress && body !== null && body !== undefined) {
    if (typeof body === 'string') {
      uploadSize = new TextEncoder().encode(body).length;
    } else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      uploadSize = body.size;
    } else if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
      uploadSize = body.byteLength;
    } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
      uploadSize = 1;
      try {
        let count = 0;
        body.forEach((val) => {
          if (typeof val === 'string') {
            count += val.length;
          } else if (val && typeof (val as Blob).size === 'number') {
            count += (val as Blob).size;
          }
        });
        if (count > 0) uploadSize = count;
      } catch {
        // Fallback for FormData environments without forEach
      }
    }
    if (uploadSize > 0) {
      onUploadProgress({
        loaded: 0,
        total: uploadSize,
        progress: 0,
        bytes: 0,
      });
    }
  }

  const debugOpt = config.debug ?? clientConfig.debug;

  const logSuccess = (res: HttpResponse<T>) => {
    if (!debugOpt) return;
    const durationMs = Date.now() - startTime;
    const entry: DebugLogEntry = {
      method,
      url: resolvedUrl,
      status: res.status,
      durationMs,
      headers: resolvedConfig.headers,
      cached: res.cached,
      fromDedup: res.fromDedup,
    };
    if (typeof debugOpt === 'function') {
      debugOpt(entry);
    } else {
      const tags = (res.cached ? ' [CACHED]' : '') + (res.fromDedup ? ' [DEDUP]' : '');
      console.log(
        `[react-native-fetch-client] ${method} ${resolvedUrl} -> ${res.status} ${res.statusText} (${durationMs}ms)${tags}`,
      );
    }
  };

  const logError = (err: unknown) => {
    if (!debugOpt) return;
    const durationMs = Date.now() - startTime;
    const entry: DebugLogEntry = {
      method,
      url: resolvedUrl,
      durationMs,
      headers: resolvedConfig.headers,
      error: err,
    };
    if (typeof debugOpt === 'function') {
      debugOpt(entry);
    } else {
      console.warn(
        `[react-native-fetch-client] ${method} ${resolvedUrl} -> ERROR (${durationMs}ms):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  let attempt = 0;
  let lastError: unknown;

  try {
    while (true) {
      attempt++;
      try {
        let response = await dispatchFetch<T>(
          resolvedUrl,
          method,
          baseHeaders,
          body,
          credentials,
          redirect,
          dispatcher,
          responseType,
          resolvedConfig,
          fetchImpl,
          totalController.signal,
          onDownloadProgress,
        );
        cleanup();

        if (onUploadProgress && uploadSize > 0) {
          onUploadProgress({
            loaded: uploadSize,
            total: uploadSize,
            progress: 1,
            bytes: uploadSize,
          });
        }

        // 7. Handle 304 Not Modified cache revalidation
        if (response.status === 304 && cacheManager && cacheKey) {
          const reqTtl =
            typeof config.cache === 'object' && config.cache.ttl !== undefined
              ? config.cache.ttl
              : undefined;
          const updated = cacheManager.updateFrom304<T>(cacheKey, response.headers, reqTtl);
          if (updated) {
            response = updated;
          }
        } else if (cacheEligible && cacheManager) {
          // Store successful response in cache
          const reqTtl =
            typeof config.cache === 'object' && config.cache.ttl !== undefined
              ? config.cache.ttl
              : undefined;
          cacheManager.set(cacheKey, response, reqTtl);
        }

        // On successful mutation, invalidate matching URL/path in cache if auto-invalidation is active
        const shouldAutoInvalidate =
          (typeof config.cache !== 'object' || config.cache.autoInvalidate !== false) &&
          clientConfig.cache?.autoInvalidateMutations !== false;

        if (
          cacheManager &&
          shouldAutoInvalidate &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
        ) {
          const urlObj = new URL(resolvedUrl, 'http://localhost');
          const pathname = urlObj.pathname;
          if (pathname && pathname !== '/') {
            if (typeof cacheManager.deleteExactPath === 'function') {
              cacheManager.deleteExactPath(pathname);
            } else {
              cacheManager.deletePattern(pathname);
            }
          }
        }

        // Custom declarative cache invalidation (e.g. cache: { invalidate: ['/users'] })
        if (cacheManager && typeof config.cache === 'object' && config.cache.invalidate) {
          for (const pattern of config.cache.invalidate) {
            cacheManager.deletePattern(pattern);
          }
        }

        // 8. Standard Schema / Duck-Typing Schema Validation
        if (config.schema) {
          const validatedData = await validateData<T>(
            config.schema as SchemaValidator<T>,
            response.data,
            resolvedConfig,
          );
          response = {
            ...response,
            data: validatedData,
          };
        }

        response.durationMs = Date.now() - startTime;
        logSuccess(response);
        return response;
      } catch (err: unknown) {
        lastError = err;

        if (
          shouldAttachAuth &&
          authManager &&
          authManager.isEligibleForRefresh(err, resolvedUrl, config._isRefreshed, config.auth)
        ) {
          cleanup();
          try {
            await authManager.waitForRefresh(totalController.signal);
            const retriedConfig: InternalRequestConfig = {
              ...config,
              _isRefreshed: true,
            };
            return await executeRequest<T>(
              retriedConfig,
              clientConfig,
              authManager,
              dedupManager,
              cacheManager,
              concurrencyLimiter,
              cancelGroups,
            );
          } catch (refreshErr: unknown) {
            if (totalController.signal.aborted) {
              const reason: unknown = totalController.signal.reason;
              if (reason instanceof TimeoutError) throw reason;
              if (reason instanceof CancelError) throw reason;
              throw new CancelError({ config: resolvedConfig, cause: reason });
            }
            throw new AuthRefreshError(refreshErr, { config: resolvedConfig });
          }
        }

        if (shouldRetry(err, attempt, resolvedConfig)) {
          const delayMs = calculateRetryDelay(attempt, resolvedConfig.retry, err);
          try {
            await sleep(delayMs, totalController.signal);
            continue;
          } catch (sleepErr: unknown) {
            if (totalController.signal.aborted) {
              const reason: unknown = totalController.signal.reason;
              if (reason instanceof TimeoutError) throw reason;
              if (reason instanceof CancelError) throw reason;
              throw new CancelError({ config: resolvedConfig, cause: reason });
            }
            throw sleepErr;
          }
        }

        if (attempt > 1) {
          throw new RetryExhaustedError(attempt, lastError, { config: resolvedConfig });
        }
        throw lastError;
      }
    }
  } catch (err: unknown) {
    cleanup();

    logError(err);

    if (err instanceof AuthRefreshError) {
      if (err.originalError instanceof Error) {
        throw err.originalError;
      }
      throw new Error(String(err.originalError), { cause: err });
    }
    if (err instanceof TimeoutError) throw err;
    if (err instanceof CancelError) throw err;
    if (err instanceof RetryExhaustedError) throw err;
    if (err instanceof HttpError) throw err;
    if (err instanceof ConfigError) throw err;
    if (err instanceof ParseError) throw err;
    if (err instanceof ValidationError) throw err;
    if (err instanceof NetworkError) throw err;

    if ((err instanceof Error && err.name === 'AbortError') || totalController.signal.aborted) {
      const reason: unknown = totalController.signal.reason;
      if (reason instanceof TimeoutError) throw reason;
      if (reason instanceof CancelError) throw reason;
      throw new CancelError({ config: resolvedConfig, cause: reason ?? err });
    }

    const msg = err instanceof Error ? err.message : 'Network request failed';
    throw new NetworkError(msg, { config: resolvedConfig, cause: err });
  }
}
