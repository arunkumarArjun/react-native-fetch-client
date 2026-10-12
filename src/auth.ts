import { HttpError } from './errors.js';
import type { AuthConfig } from './types.js';

/**
 * Manages authentication token attachment and single-flight token refresh.
 * Scoped to each client instance to ensure state isolation.
 */
export class AuthManager {
  private activeRefreshPromise: Promise<string> | null = null;

  constructor(private readonly config?: AuthConfig) {}

  /** Returns the configured header name in lowercase, defaulting to 'authorization'. */
  getHeaderName(): string {
    return (this.config?.headerName || 'Authorization').toLowerCase();
  }

  /**
   * Attaches the access token retrieved from `getToken()` to request headers.
   * Does not overwrite an existing explicit header of the same name.
   */
  async attachToken(
    headers: Record<string, string>,
    _url: string,
    requestAuth?: boolean | { skip?: boolean },
  ): Promise<void> {
    if (!this.config?.getToken) {
      return;
    }

    if (requestAuth === false || (typeof requestAuth === 'object' && requestAuth.skip)) {
      return;
    }

    const token = await this.config.getToken();
    if (!token) {
      return;
    }

    const headerKey = this.getHeaderName();
    if (!headers[headerKey]) {
      const prefix = this.config.tokenPrefix !== undefined ? this.config.tokenPrefix : 'Bearer ';
      headers[headerKey] = `${prefix}${token}`;
    }
  }

  /**
   * Checks whether an error from a request URL is eligible for a token refresh attempt.
   */
  isEligibleForRefresh(
    error: unknown,
    url: string,
    isRefreshed?: boolean,
    requestAuth?: boolean | { skip?: boolean },
  ): boolean {
    if (!this.config?.refreshToken) {
      return false;
    }

    // Prevent infinite refresh loops: only one refresh per original request
    if (isRefreshed) {
      return false;
    }

    // Request explicitly opted out of auth
    if (requestAuth === false || (typeof requestAuth === 'object' && requestAuth.skip)) {
      return false;
    }

    // Must be an HTTP response error
    if (!(error instanceof HttpError)) {
      return false;
    }

    const refreshStatuses = this.config.refreshOn ?? [401];
    if (!refreshStatuses.includes(error.status)) {
      return false;
    }

    // Check excluded URLs (e.g. refresh endpoint itself)
    if (this.isExcludedUrl(url)) {
      return false;
    }

    return true;
  }

  /**
   * Initiates or shares an in-flight single-flight token refresh operation.
   * Concurrent 401s await the same Promise. Cleared on completion or error.
   */
  refresh(): Promise<string> {
    const refreshTokenFn = this.config?.refreshToken;
    if (!refreshTokenFn) {
      return Promise.reject(new Error('refreshToken callback is not configured'));
    }

    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    this.activeRefreshPromise = Promise.resolve()
      .then(() => refreshTokenFn())
      .finally(() => {
        this.activeRefreshPromise = null;
      });

    return this.activeRefreshPromise;
  }

  /**
   * Waits for token refresh while respecting the caller's request cancellation signal.
   */
  waitForRefresh(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) {
      const reason: unknown = signal.reason;
      if (reason instanceof Error) {
        return Promise.reject(reason);
      }
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    const refreshPromise = this.refresh();

    if (!signal) {
      return refreshPromise;
    }

    let abortHandler: (() => void) | undefined;
    const abortPromise = new Promise<never>((_, reject) => {
      abortHandler = () => {
        const reason: unknown = signal.reason;
        if (reason instanceof Error) {
          reject(reason);
        } else {
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    });

    return Promise.race([refreshPromise, abortPromise]).finally(() => {
      if (abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    });
  }

  private isExcludedUrl(url: string): boolean {
    if (!this.config?.refreshExcludeUrls || this.config.refreshExcludeUrls.length === 0) {
      return false;
    }

    return this.config.refreshExcludeUrls.some((entry) => {
      if (typeof entry === 'string') {
        return url === entry || url.includes(entry);
      }
      return entry.test(url);
    });
  }
}
