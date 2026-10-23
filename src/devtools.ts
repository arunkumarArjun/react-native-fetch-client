/**
 * Universal DevTools Stealth Mode.
 *
 * Provides cross-platform privacy and anti-reverse-engineering mechanisms
 * for React Native (Mobile), Web Browsers, and Node.js environments.
 *
 * @module devtools
 */

import type { DevToolsPrivacyFilter } from './types.js';

interface ReactNativeXHR {
  _url?: string;
}

type XHRSendCallback = (data: unknown, xhr: ReactNativeXHR) => void;
type XHRResponseCallback = (status: number, timeout: number, response: unknown, url?: string) => void;

interface ReactNativeXHRInterceptor {
  isInterceptorEnabled?: () => boolean;
  _sendCallback?: XHRSendCallback;
  _responseCallback?: XHRResponseCallback;
  setSendCallback: (callback: XHRSendCallback) => void;
  setResponseCallback: (callback: XHRResponseCallback) => void;
}

interface ReactNativeGlobalScope {
  __REACT_NATIVE_XHR_INTERCEPTOR__?: ReactNativeXHRInterceptor;
  nativeCallSyncHook?: unknown;
  require?: (moduleName: string) => unknown;
}

/**
 * Checks whether a given URL is configured to be hidden from developer tools
 * based on the provided `DevToolsPrivacyFilter`.
 *
 * @param url The resolved target URL.
 * @param filter The privacy filter configuration (boolean or array of strings/RegExps).
 * @returns `true` if the request should be hidden from developer tools, otherwise `false`.
 */
export function isDevToolsHidden(url: string, filter?: DevToolsPrivacyFilter): boolean {
  if (!filter) {
    return false;
  }

  if (filter === true) {
    return true;
  }

  if (!Array.isArray(filter) || filter.length === 0) {
    return false;
  }

  return filter.some((entry) => {
    if (typeof entry === 'string') {
      return url === entry || url.includes(entry);
    }
    if (entry instanceof RegExp) {
      return entry.test(url);
    }
    return false;
  });
}

/**
 * Tracks currently suppressed active request URLs to prevent race conditions.
 */
const activeSuppressedUrls = new Set<string>();

/**
 * Safely accesses React Native's internal XHRInterceptor if running in React Native.
 * Uses lazy dynamic resolution to ensure zero bundler warnings in Web/Node.js environments.
 */
function getReactNativeXHRInterceptor(): ReactNativeXHRInterceptor | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const g = globalThis as unknown as ReactNativeGlobalScope;
  if (g.__REACT_NATIVE_XHR_INTERCEPTOR__) {
    return g.__REACT_NATIVE_XHR_INTERCEPTOR__;
  }

  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { product?: string }) : undefined;
  const isRN = Boolean(nav?.product === 'ReactNative' || g.nativeCallSyncHook);

  if (!isRN) {
    return null;
  }

  try {
    const req = typeof g.require === 'function' ? g.require : null;
    if (req) {
      const interceptor = req('react-native/Libraries/Network/XHRInterceptor') as ReactNativeXHRInterceptor | undefined;
      if (interceptor && typeof interceptor.setSendCallback === 'function') {
        g.__REACT_NATIVE_XHR_INTERCEPTOR__ = interceptor;
        return interceptor;
      }
    }
  } catch {
    // Graceful no-op if internal module path changes or is restricted
  }

  return null;
}

/**
 * Temporarily wraps an execution block while suppressing React Native's
 * DevTools / Chrome Inspect network reporter for the matching request.
 *
 * @param url The target request URL.
 * @param isHidden Whether the URL matches the stealth mode filter.
 * @param fn The request executor function.
 * @returns The result of the request executor function.
 */
export async function withDevToolsSuppression<T>(
  url: string,
  isHidden: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isHidden) {
    return fn();
  }

  activeSuppressedUrls.add(url);
  const interceptor = getReactNativeXHRInterceptor();

  let originalSendCallback: XHRSendCallback | undefined;
  let originalResponseCallback: XHRResponseCallback | undefined;
  let isHooked = false;

  if (interceptor && typeof interceptor.isInterceptorEnabled === 'function') {
    try {
      if (interceptor.isInterceptorEnabled()) {
        originalSendCallback = interceptor._sendCallback;
        originalResponseCallback = interceptor._responseCallback;

        interceptor.setSendCallback((data: unknown, xhr: ReactNativeXHR) => {
          if (xhr._url && activeSuppressedUrls.has(xhr._url)) {
            return;
          }
          if (typeof originalSendCallback === 'function') {
            originalSendCallback(data, xhr);
          }
        });

        isHooked = true;
      }
    } catch {
      // Safe fallback if interceptor internals differ
    }
  }

  try {
    return await fn();
  } finally {
    activeSuppressedUrls.delete(url);

    if (isHooked && interceptor) {
      try {
        if (typeof originalSendCallback === 'function') {
          interceptor.setSendCallback(originalSendCallback);
        }
        if (typeof originalResponseCallback === 'function') {
          interceptor.setResponseCallback(originalResponseCallback);
        }
      } catch {
        // Safe cleanup
      }
    }
  }
}
