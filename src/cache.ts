import type {
  CacheConfig,
  CacheStorageAdapter,
  HttpMethod,
  HttpResponse,
  RequestCacheConfig,
  ResponseCache,
} from './types.js';

/** Internal cache entry storing the cloned response and expiration timestamp. */
export interface CacheEntry<T = unknown> {
  response: HttpResponse<T>;
  expiresAt: number;
  etag?: string;
  lastModified?: string;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_SIZE = 100;
const SAFE_CACHE_METHODS: ReadonlySet<HttpMethod> = new Set(['GET', 'HEAD']);

/**
 * Deep clones data to prevent consumer mutation of cached objects or
 * mutation of returned responses corrupting cache storage.
 */
export function cloneData<T>(data: T): T {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(data);
    } catch {
      // Fallback for non-cloneable objects
    }
  }
  try {
    return JSON.parse(JSON.stringify(data)) as T;
  } catch {
    return data;
  }
}

/**
 * Generates a cache key for a request.
 * Normalizes URL and includes authorization header hash/slice if authenticated caching is allowed.
 */
export function generateCacheKey(
  method: string,
  url: string,
  headers?: Record<string, string>,
  allowAuthenticated = false,
): string {
  const normMethod = method.toUpperCase();
  const urlObj = new URL(url, 'http://localhost');
  urlObj.searchParams.sort();
  const sortedUrl = urlObj.pathname + (urlObj.search ? urlObj.search : '');

  let authPart = '';
  if (allowAuthenticated && headers) {
    const authHeader = headers['authorization'] ?? headers['Authorization'];
    if (authHeader) {
      authPart = `|auth:${authHeader}`;
    }
  }

  return `${normMethod}:${sortedUrl}${authPart}`;
}

/**
 * Checks if a request method and headers are eligible for caching.
 * Unsafe methods (POST, PUT, PATCH, DELETE) are never eligible.
 */
export function isCacheEligible(
  method: string,
  headers: Record<string, string> | undefined,
  requestCache: RequestCacheConfig | boolean | undefined,
  clientCache: CacheConfig | undefined,
): boolean {
  const normMethod = method.toUpperCase() as HttpMethod;

  // Unsafe methods are strictly never cacheable
  if (!SAFE_CACHE_METHODS.has(normMethod)) {
    return false;
  }

  // Request-level explicit skip
  if (requestCache === false) {
    return false;
  }
  if (typeof requestCache === 'object' && requestCache.skip === true) {
    return false;
  }

  const enabled =
    (typeof requestCache === 'object' && !requestCache.skip) ||
    requestCache === true ||
    (clientCache?.enabled ?? false);

  if (!enabled) {
    return false;
  }

  // Check allowed methods configured in clientCache
  const allowedMethods = clientCache?.methods ?? ['GET', 'HEAD'];
  if (!allowedMethods.includes(normMethod)) {
    return false;
  }

  // Check authenticated isolation rule:
  // If request contains authorization header and allowAuthenticated is false (or not set), do not cache.
  const authHeader = headers ? (headers['authorization'] ?? headers['Authorization']) : undefined;
  if (authHeader && !(clientCache?.allowAuthenticated ?? false)) {
    return false;
  }

  return true;
}

/**
 * LRU cache manager supporting in-memory and persistent storage adapters (MMKV / AsyncStorage)
 * with RFC 7234 conditional validation and Stale-While-Revalidate (SWR) support.
 */
export class CacheManager implements ResponseCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtl: number;
  private readonly maxSize: number;
  public readonly storage?: CacheStorageAdapter;
  public readonly storageKey: string;
  public readonly defaultStrategy: 'cache-first' | 'stale-while-revalidate';

  constructor(config?: CacheConfig) {
    this.defaultTtl = config?.defaultTtl ?? config?.ttl ?? DEFAULT_TTL_MS;
    this.maxSize = config?.maxSize ?? DEFAULT_MAX_SIZE;
    if (config?.storage !== undefined) {
      this.storage = config.storage;
    }
    this.storageKey = config?.storageKey ?? 'rnfc_http_cache';
    this.defaultStrategy = config?.strategy ?? config?.defaultStrategy ?? 'cache-first';

    // Auto-hydrate if persistent storage is provided
    if (this.storage) {
      void this.hydrate();
    }
  }

  /**
   * Hydrates cached entries from persistent storage into memory.
   */
  public async hydrate(): Promise<void> {
    if (!this.storage) return;
    try {
      const raw = await this.storage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<[string, CacheEntry<unknown>]>;
      const now = Date.now();
      if (Array.isArray(parsed)) {
        for (const [key, entry] of parsed) {
          if (entry && typeof entry === 'object' && entry.expiresAt > now) {
            this.store.set(key, entry);
          }
        }
      }
    } catch {
      // Ignore hydration parse errors
    }
  }

  /**
   * Persists active (non-expired) cache entries to storage adapter.
   */
  public async persist(): Promise<void> {
    if (!this.storage) return;
    try {
      const now = Date.now();
      const entries: Array<[string, CacheEntry<unknown>]> = [];
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt > now) {
          entries.push([key, entry]);
        }
      }
      await this.storage.setItem(this.storageKey, JSON.stringify(entries));
    } catch {
      // Ignore persistence errors
    }
  }

  /**
   * Retrieves a cached response by key.
   * If expired and allowStale is false, evicts the entry and returns undefined.
   */
  public get<T = unknown>(
    key: string,
    options?: { allowStale?: boolean },
  ): HttpResponse<T> | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }

    const isExpired = Date.now() > entry.expiresAt;
    if (isExpired && !options?.allowStale) {
      this.store.delete(key);
      if (this.storage) void this.persist();
      return undefined;
    }

    // LRU touch: delete and re-insert so it becomes most recently used
    this.store.delete(key);
    this.store.set(key, entry);

    // Return cloned response with cached: true and stale indicator
    const res: HttpResponse<T> = {
      ...entry.response,
      data: cloneData(entry.response.data),
      cached: true,
    };
    if (isExpired) {
      res.stale = true;
    }
    return res;
  }

  /**
   * Checks if an entry exists and is expired (stale).
   */
  public isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    return Date.now() > entry.expiresAt;
  }

  /**
   * Retrieves the raw cache entry (including expired entries) for conditional revalidation.
   */
  public getEntry<T = unknown>(key: string): CacheEntry<T> | undefined {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }

  /**
   * Revalidates an existing cache entry on receiving an HTTP 304 Not Modified response.
   * Updates headers, extends TTL, and returns the response with fresh cached data.
   */
  public updateFrom304<T = unknown>(
    key: string,
    newHeaders: Record<string, string>,
    ttlMs?: number,
  ): HttpResponse<T> | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    const ttl = ttlMs !== undefined && ttlMs >= 0 ? ttlMs : this.defaultTtl;
    entry.expiresAt = Date.now() + ttl;

    const mergedHeaders = { ...entry.response.headers, ...newHeaders };
    entry.response = {
      ...entry.response,
      headers: mergedHeaders,
    };
    if (newHeaders['etag'] !== undefined) {
      entry.etag = newHeaders['etag'];
    }
    if (newHeaders['last-modified'] !== undefined) {
      entry.lastModified = newHeaders['last-modified'];
    }

    // LRU touch
    this.store.delete(key);
    this.store.set(key, entry);

    if (this.storage) void this.persist();

    return {
      ...entry.response,
      data: cloneData(entry.response.data),
      cached: true,
      stale: false,
    };
  }

  public set<T = unknown>(key: string, response: HttpResponse<T>, ttlMs?: number): void {
    const ttl = ttlMs !== undefined && ttlMs >= 0 ? ttlMs : this.defaultTtl;
    const expiresAt = Date.now() + ttl;

    const etag = response.headers['etag'];
    const lastModified = response.headers['last-modified'];

    // Deep clone data to store immutable snapshot
    const entry: CacheEntry<T> = {
      response: {
        ...response,
        data: cloneData(response.data),
        cached: true,
      },
      expiresAt,
    };
    if (etag !== undefined) {
      entry.etag = etag;
    }
    if (lastModified !== undefined) {
      entry.lastModified = lastModified;
    }

    // If key exists, delete it first to update LRU order
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict least recently used (first item in Map iteration)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, entry);

    if (this.storage) void this.persist();
  }

  public has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      if (this.storage) void this.persist();
      return false;
    }
    return true;
  }

  public delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted && this.storage) void this.persist();
    return deleted;
  }

  public deletePattern(pattern: string | RegExp): number {
    let deletedCount = 0;
    const keysToDelete: string[] = [];

    for (const key of this.store.keys()) {
      if (typeof pattern === 'string') {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      } else if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.store.delete(key)) {
        deletedCount++;
      }
    }

    if (deletedCount > 0 && this.storage) void this.persist();

    return deletedCount;
  }

  public clear(): void {
    this.store.clear();
    if (this.storage) void this.storage.removeItem(this.storageKey);
  }

  public get size(): number {
    // Purge expired entries when inspecting size for accurate count
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}
