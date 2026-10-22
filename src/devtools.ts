/**
 * Universal DevTools Stealth Mode.
 *
 * Provides cross-platform privacy and anti-reverse-engineering mechanisms
 * for React Native (Mobile), Web Browsers, and Node.js environments.
 *
 * @module devtools
 */

import type { DevToolsPrivacyFilter } from './types.js';

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
function getReactNativeXHRInterceptor(): any {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  // Check if already exposed on global or module scope
  const g = globalThis as any;
  if (g.__REACT_NATIVE_XHR_INTERCEPTOR__) {
    return g.__REACT_NATIVE_XHR_INTERCEPTOR__;
  }

  // Check if running in React Native environment
  const isRN =
    typeof navigator !== 'undefined' &&
    (navigator.product === 'ReactNative' || Boolean(g.nativeCallSyncHook));

  if (!isRN) {
    return null;
  }

  try {
    // Dynamic require inside try/catch for React Native bundler compatibility
    const req = typeof g.require === 'function' ? g.require : null;
    if (req) {
      const interceptor = req('react-native/Libraries/Network/XHRInterceptor');
      if (interceptor) {
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

  let originalSendCallback: any;
  let originalResponseCallback: any;
  let isHooked = false;

  if (interceptor && typeof interceptor.isInterceptorEnabled === 'function') {
    try {
      if (interceptor.isInterceptorEnabled()) {
        // Save current callbacks if present
        originalSendCallback = interceptor._sendCallback;
        originalResponseCallback = interceptor._responseCallback;

        // Wrap send callback to filter suppressed URLs from reaching DevTools
        interceptor.setSendCallback((data: any, xhr: any) => {
          if (xhr && xhr._url && activeSuppressedUrls.has(xhr._url)) {
            // Mute event from Chrome Inspect
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
