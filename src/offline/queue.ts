import { ConfigError, isHttpError, isNetworkError, isTimeoutError } from '../errors.js';
import { MemoryStorageAdapter } from './storage.js';
import type {
  OfflineQueue,
  OfflineQueueConfig,
  OfflineStorageAdapter,
  QueuedRequest,
  QueueProcessSummary,
} from './types.js';
import type { HttpMethod, RequestConfig } from '../types.js';

const DEFAULT_STORAGE_KEY = 'fnc_offline_queue';
const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_AGE_MS = 86_400_000; // 24 hours
const DEFAULT_IDEMPOTENCY_HEADER = 'Idempotency-Key';

// Strict default blacklist for financial / critical mutations
const DEFAULT_DISALLOWED_PATTERNS: ReadonlyArray<RegExp> = [
  /\/pay(\/|$)/i,
  /\/payment(\/|$)/i,
  /\/checkout(\/|$)/i,
  /\/orders?(\/|$)/i,
  /\/charge(\/|$)/i,
  /\/billing(\/|$)/i,
  /\/subscribe(\/|$)/i,
  /\/refund(\/|$)/i,
];

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'req_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function isDisallowed(url: string, customPatterns?: Array<string | RegExp>): boolean {
  for (const pattern of DEFAULT_DISALLOWED_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  if (customPatterns) {
    for (const pattern of customPatterns) {
      if (typeof pattern === 'string') {
        if (url.includes(pattern)) return true;
      } else if (pattern.test(url)) {
        return true;
      }
    }
  }
  return false;
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    throw new ConfigError('FormData bodies cannot be serialized to persistent offline storage');
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    throw new ConfigError('Blob bodies cannot be serialized to persistent offline storage');
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    throw new ConfigError('ArrayBuffer bodies cannot be serialized to persistent offline storage');
  }
  try {
    return JSON.stringify(body);
  } catch {
    throw new ConfigError('Request body cannot be serialized for offline queue');
  }
}

/**
 * Creates an offline request queue with persistent storage, sequential replay,
 * duplicate prevention via idempotency keys, and payment mutation guards.
 */
export function createOfflineQueue(config: OfflineQueueConfig): OfflineQueue {
  const storage: OfflineStorageAdapter = config.storage ?? new MemoryStorageAdapter();
  const storageKey = config.storageKey ?? DEFAULT_STORAGE_KEY;
  const maxQueueSize = config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const idempotencyHeader = config.idempotencyHeader ?? DEFAULT_IDEMPOTENCY_HEADER;

  let initialized = false;
  let processing = false;
  let inMemoryQueue: QueuedRequest[] = [];

  const persist = async (): Promise<void> => {
    const raw = JSON.stringify(inMemoryQueue);
    await storage.setItem(storageKey, raw);
  };

  const initialize = async (): Promise<void> => {
    if (initialized) return;
    try {
      const stored = await storage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as QueuedRequest[];
        const now = Date.now();
        // Hydrate and filter out stale/expired entries
        inMemoryQueue = parsed.filter((item) => now - item.enqueuedAt < maxAgeMs);
      }
    } catch {
      inMemoryQueue = [];
    }
    initialized = true;
    await persist();
  };

  const enqueue = async (reqConfig: RequestConfig): Promise<{ enqueued: boolean; id: string }> => {
    await initialize();

    const url = reqConfig.url ?? '';
    if (!url) {
      throw new ConfigError('Cannot enqueue request without a URL');
    }

    // Guard: Prevent payment and order mutations
    if (isDisallowed(url, config.disallowedUrls)) {
      throw new ConfigError(
        `Offline queuing is prohibited for critical/payment URL: "${url}". Please retry with network connectivity.`,
      );
    }

    // Check custom predicate if supplied
    if (config.shouldQueue && !config.shouldQueue(reqConfig)) {
      return { enqueued: false, id: '' };
    }

    if (inMemoryQueue.length >= maxQueueSize) {
      throw new ConfigError(
        `Offline queue capacity limit of ${maxQueueSize} entries reached. Cannot enqueue request.`,
      );
    }

    const method: HttpMethod = reqConfig.method ?? 'GET';
    const serializedBody = serializeBody(reqConfig.body);
    const id = generateId();

    // Idempotency: use existing idempotency header or generate one
    let assignedIdempotencyKey = '';
    const normHeaders: Record<string, string> = {};
    if (reqConfig.headers) {
      if (typeof (reqConfig.headers as Headers).forEach === 'function') {
        (reqConfig.headers as Headers).forEach((v, k) => {
          normHeaders[k.toLowerCase()] = v;
        });
      } else if (Array.isArray(reqConfig.headers)) {
        for (const [k, v] of reqConfig.headers) {
          normHeaders[k.toLowerCase()] = v;
        }
      } else {
        for (const [k, v] of Object.entries(reqConfig.headers)) {
          if (typeof v === 'string') {
            normHeaders[k.toLowerCase()] = v;
          }
        }
      }
      assignedIdempotencyKey =
        normHeaders[idempotencyHeader.toLowerCase()] ??
        normHeaders['idempotency-key'] ??
        normHeaders['x-idempotency-key'] ??
        '';
    }

    if (!assignedIdempotencyKey) {
      assignedIdempotencyKey = id;
      normHeaders[idempotencyHeader.toLowerCase()] = assignedIdempotencyKey;
    }

    const queuedItem: QueuedRequest = {
      id,
      url,
      method,
      headers: normHeaders,
      enqueuedAt: Date.now(),
      attemptCount: 0,
      maxAttempts,
      idempotencyKey: assignedIdempotencyKey,
    };
    if (reqConfig.params) {
      queuedItem.params = { ...reqConfig.params };
    }
    if (serializedBody !== undefined) {
      queuedItem.body = serializedBody;
    }

    inMemoryQueue.push(queuedItem);
    await persist();

    return { enqueued: true, id };
  };

  const process = async (): Promise<QueueProcessSummary> => {
    await initialize();

    if (processing) {
      return {
        processed: 0,
        succeeded: 0,
        failedPermanent: 0,
        failedTransient: 0,
        remaining: inMemoryQueue.length,
      };
    }

    processing = true;
    let succeeded = 0;
    let failedPermanent = 0;
    let failedTransient = 0;
    let processed = 0;

    try {
      while (inMemoryQueue.length > 0) {
        const current = inMemoryQueue[0];
        if (!current) break;

        // Check age expiration
        if (Date.now() - current.enqueuedAt > maxAgeMs) {
          inMemoryQueue.shift();
          failedPermanent++;
          processed++;
          config.onPermanentFailure?.(
            current,
            new ConfigError(`Queued request expired after ${maxAgeMs}ms`),
          );
          await persist();
          continue;
        }

        current.attemptCount++;
        processed++;

        // Reconstruct request config
        let parsedBody: unknown = current.body;
        if (current.body && (current.body.startsWith('{') || current.body.startsWith('['))) {
          try {
            parsedBody = JSON.parse(current.body);
          } catch {
            parsedBody = current.body;
          }
        }

        const requestConfig: RequestConfig & { url: string; method: HttpMethod } = {
          url: current.url,
          method: current.method,
        };
        if (current.headers) {
          requestConfig.headers = current.headers;
        }
        if (current.params) {
          requestConfig.params = current.params;
        }
        if (parsedBody !== undefined && parsedBody !== null) {
          requestConfig.body = parsedBody as NonNullable<RequestConfig['body']>;
        }

        try {
          const response = await config.client.request(requestConfig);
          // Request succeeded!
          inMemoryQueue.shift();
          succeeded++;
          await persist();
          config.onReplaySuccess?.(current, response);
        } catch (err: unknown) {
          // Check for permanent client error (4xx)
          const is4xx =
            isHttpError(err) && err.status >= 400 && err.status < 500 && err.status !== 429;
          const isExhausted = current.attemptCount >= current.maxAttempts;

          if (is4xx || isExhausted) {
            // Permanent failure (poison-pill): drop from queue
            inMemoryQueue.shift();
            failedPermanent++;
            await persist();
            config.onPermanentFailure?.(current, err);
          } else if (isNetworkError(err) || isTimeoutError(err)) {
            // Network dropped: halt queue processing immediately to preserve FIFO order
            failedTransient++;
            await persist();
            break;
          } else {
            // Transient 5xx or 429: update attempt count and halt or continue
            failedTransient++;
            await persist();
            break;
          }
        }
      }
    } finally {
      processing = false;
    }

    return {
      processed,
      succeeded,
      failedPermanent,
      failedTransient,
      remaining: inMemoryQueue.length,
    };
  };

  const getItems = async (): Promise<QueuedRequest[]> => {
    await initialize();
    return [...inMemoryQueue];
  };

  const size = async (): Promise<number> => {
    await initialize();
    return inMemoryQueue.length;
  };

  const clear = async (): Promise<void> => {
    inMemoryQueue = [];
    initialized = true;
    await storage.removeItem(storageKey);
  };

  let onlineListener: (() => void) | undefined;
  if (
    config.autoSyncOnOnline &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    onlineListener = () => {
      process().catch(() => {});
    };
    window.addEventListener('online', onlineListener);
  }

  const destroy = (): void => {
    if (
      onlineListener &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('online', onlineListener);
      onlineListener = undefined;
    }
  };

  const isProcessing = (): boolean => processing;

  return {
    enqueue,
    process,
    isProcessing,
    getItems,
    size,
    clear,
    initialize,
    destroy,
  };
}
