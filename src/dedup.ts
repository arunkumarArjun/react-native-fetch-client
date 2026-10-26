import { CancelError, createAbortError } from './errors.js';
import { isAbsoluteUrl } from './url.js';
import type { DedupConfig, HttpMethod, HttpResponse } from './types.js';

interface Subscriber<T> {
  resolve: (res: HttpResponse<T>) => void;
  reject: (err: unknown) => void;
  cleanup: () => void;
}

interface InFlightEntry<T> {
  key: string;
  underlyingAbortController: AbortController;
  subscribers: Set<Subscriber<T>>;
  promise: Promise<HttpResponse<T>>;
}

function hashAuthHeader(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generates a stable, deterministic key representing an in-flight request identity.
 * Accounts for method, normalized URL, sorted relevant headers, credentials, body, and responseType.
 */
export function generateDedupKey(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  credentials?: RequestCredentials,
  body?: unknown,
  responseType?: string,
): string {
  const m = method.toUpperCase();

  let normalizedUrl = url;
  try {
    const isRelative = !isAbsoluteUrl(url);
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.sort();
    const pathWithSearch = parsed.pathname + parsed.search;
    normalizedUrl = isRelative ? pathWithSearch : `${parsed.origin}${pathWithSearch}`;
  } catch {
    // Keep original url
  }

  const relevantKeys = ['accept', 'content-type', 'authorization', 'accept-language'];
  const headerPairs: string[] = [];
  for (const k of Object.keys(headers).sort()) {
    const lk = k.toLowerCase();
    const val = headers[k];
    if (!val) continue;

    if (lk === 'authorization') {
      headerPairs.push(`${lk}:${hashAuthHeader(val)}`);
    } else if (relevantKeys.includes(lk) || lk.startsWith('x-')) {
      headerPairs.push(`${lk}=${val}`);
    }
  }

  const creds = credentials || 'same-origin';
  const resType = responseType || 'json';

  let bodyStr = '';
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      bodyStr = body;
    } else {
      try {
        bodyStr = JSON.stringify(body) ?? '';
      } catch {
        bodyStr = '[unserializable-body]';
      }
    }
  }

  return `${m}|${normalizedUrl}|${resType}|${creds}|${headerPairs.join('&')}|${bodyStr}`;
}

/**
 * Determines whether a request method and configuration are eligible for deduplication.
 * Safe methods (GET, HEAD) only by default. Unsafe mutation methods (POST, PUT, PATCH, DELETE)
 * are excluded unless explicitly specified in methods configuration.
 */
export function isDedupEligible(
  method: string,
  requestDedup?: DedupConfig | boolean,
  clientDedup?: DedupConfig,
): boolean {
  if (requestDedup === false) {
    return false;
  }

  let enabled = false;
  if (requestDedup === true) {
    enabled = true;
  } else if (typeof requestDedup === 'object' && requestDedup.enabled !== undefined) {
    enabled = requestDedup.enabled;
  } else if (clientDedup?.enabled) {
    enabled = clientDedup.enabled;
  }

  if (!enabled) {
    return false;
  }

  const allowedMethods: HttpMethod[] = (typeof requestDedup === 'object' && requestDedup.methods) ||
    clientDedup?.methods || ['GET', 'HEAD'];

  return allowedMethods.includes(method as HttpMethod);
}

/**
 * Coordinates in-flight request deduplication with fine-grained cancellation semantics.
 * Each client maintains its own DedupManager instance for complete isolation.
 */
export class DedupManager {
  private inFlight = new Map<string, InFlightEntry<unknown>>();

  /**
   * Executes or joins an in-flight request for the given deduplication key.
   * If a matching request is already in flight, the caller subscribes to it.
   * If an individual caller cancels their AbortSignal, that caller immediately rejects,
   * but the underlying request continues for other subscribers.
   * The underlying request is only aborted if all subscribers have cancelled.
   */
  execute<T>(
    key: string,
    factory: (signal: AbortSignal) => Promise<HttpResponse<T>>,
    callerSignal?: AbortSignal,
  ): Promise<HttpResponse<T>> {
    if (callerSignal?.aborted) {
      const reason: unknown = callerSignal.reason;
      if (reason instanceof CancelError) {
        return Promise.reject(reason);
      }
      return Promise.reject(new CancelError({ cause: reason ?? createAbortError() }));
    }

    let entry = this.inFlight.get(key) as InFlightEntry<T> | undefined;
    const isPrimary = !entry;

    if (!entry) {
      const underlyingAbortController = new AbortController();
      const subscribers = new Set<Subscriber<T>>();

      const inFlightPromise = factory(underlyingAbortController.signal);

      entry = {
        key,
        underlyingAbortController,
        subscribers,
        promise: inFlightPromise,
      };

      this.inFlight.set(key, entry as InFlightEntry<unknown>);

      inFlightPromise
        .then((response) => {
          this.inFlight.delete(key);
          for (const sub of subscribers) {
            sub.cleanup();
            sub.resolve(response);
          }
        })
        .catch((error: unknown) => {
          this.inFlight.delete(key);
          for (const sub of subscribers) {
            sub.cleanup();
            sub.reject(error);
          }
        });
    }

    const currentEntry = entry;

    return new Promise<HttpResponse<T>>((resolve, reject) => {
      const onAbort = (): void => {
        cleanup();
        const reason: unknown = callerSignal?.reason;
        const cancelErr =
          reason instanceof CancelError
            ? reason
            : new CancelError({ cause: reason ?? createAbortError() });
        reject(cancelErr);

        // If all subscribers have cancelled, abort the underlying network call
        if (currentEntry.subscribers.size === 0) {
          this.inFlight.delete(key);
          currentEntry.underlyingAbortController.abort(createAbortError('All subscribers aborted'));
        }
      };

      const cleanup = (): void => {
        if (callerSignal) {
          callerSignal.removeEventListener('abort', onAbort);
        }
        currentEntry.subscribers.delete(subscriber);
      };

      const subscriber: Subscriber<T> = {
        resolve: (res) => {
          cleanup();
          resolve(isPrimary ? { ...res, fromDedup: false } : { ...res, fromDedup: true });
        },
        reject: (err) => {
          cleanup();
          const errObj =
            err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Unknown error');
          reject(errObj);
        },
        cleanup,
      };

      if (callerSignal) {
        callerSignal.addEventListener('abort', onAbort, { once: true });
      }

      currentEntry.subscribers.add(subscriber);
    });
  }

  /** Returns the current number of active in-flight deduplicated requests. */
  getActiveCount(): number {
    return this.inFlight.size;
  }

  /** Clears all in-flight entries. */
  clear(): void {
    this.inFlight.clear();
  }
}
