import type { HttpMethod, HttpResponse, PathParams, QueryParams, RequestConfig } from '../types.js';

/**
 * Storage adapter interface for persistent offline queue.
 * Compatible with localStorage, IndexedDB, AsyncStorage, etc.
 */
export interface OfflineStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

/**
 * A serialized representation of a request queued for offline replay.
 */
export interface QueuedRequest {
  id: string;
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  params?: QueryParams;
  pathParams?: PathParams;
  body?: string;
  enqueuedAt: number;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
}

/**
 * Summary of a queue process execution.
 */
export interface QueueProcessSummary {
  processed: number;
  succeeded: number;
  failedPermanent: number;
  failedTransient: number;
  remaining: number;
}

/**
 * Configuration for the offline request queue.
 */
export interface OfflineQueueConfig {
  /** The react-native-fetch-client instance used to execute replayed requests. */
  client: {
    request<T = unknown>(
      config: RequestConfig & { url: string; method: HttpMethod },
    ): Promise<HttpResponse<T>>;
  };
  /** Storage adapter for persisting the queue. Defaults to in-memory adapter. */
  storage?: OfflineStorageAdapter;
  /** Storage key used by the adapter. Default: 'fnc_offline_queue'. */
  storageKey?: string;
  /** Maximum number of requests stored in the queue. Default: 100. */
  maxQueueSize?: number;
  /** Maximum retry attempts for transient errors before eviction. Default: 5. */
  maxAttempts?: number;
  /** Maximum age of a queued request in milliseconds before eviction. Default: 86400000 (24 hours). */
  maxAgeMs?: number;
  /** Header name used for idempotency keys. Default: 'Idempotency-Key'. */
  idempotencyHeader?: string;
  /**
   * URLs that are strictly forbidden from offline queuing (e.g. payment/checkout).
   * Default includes common financial / mutation endpoints.
   */
  disallowedUrls?: Array<string | RegExp>;
  /** Custom predicate to evaluate whether a request is eligible to be enqueued. */
  shouldQueue?: (config: RequestConfig, error?: unknown) => boolean;
  /** Called when a queued request succeeds during replay. */
  onReplaySuccess?: (request: QueuedRequest, response: HttpResponse) => void;
  /** Called when a queued request fails permanently (e.g. 4xx) or exceeds maxAttempts. */
  onPermanentFailure?: (request: QueuedRequest, error: unknown) => void;
  /**
   * Automatically listen for browser `online` events and trigger `process()`
   * when network connectivity is restored.
   * Gracefully ignored in non-browser (Node.js/worker) environments.
   * Default: false.
   */
  autoSyncOnOnline?: boolean;
  /**
   * Custom network connectivity subscriber for non-browser environments like React Native
   * (e.g. `@react-native-community/netinfo`).
   * When connectivity is restored, invoke the `onOnline` callback to trigger `process()`.
   * Return an unsubscribe function to be invoked on `queue.destroy()`.
   */
  subscribeOnline?: (onOnline: () => void) => (() => void) | void;
}

/**
 * Public interface of the offline request queue.
 */
export interface OfflineQueue {
  /** Enqueue a request for offline replay. */
  enqueue(config: RequestConfig): Promise<{ enqueued: boolean; id: string }>;
  /** Process the queue sequentially. Resolves with a summary of the run. */
  process(): Promise<QueueProcessSummary>;
  /** Check if the queue is currently processing. */
  isProcessing(): boolean;
  /** Get all currently queued requests. */
  getItems(): Promise<QueuedRequest[]>;
  /** Current count of queued requests. */
  size(): Promise<number>;
  /** Clear all queued requests from memory and persistent storage. */
  clear(): Promise<void>;
  /** Hydrate and clean stale entries from storage. Automatically called on first operation. */
  initialize(): Promise<void>;
  /** Unregisters any attached event listeners (e.g. `online` listener) and releases resources. */
  destroy(): void;
}
