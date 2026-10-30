/**
 * URL resolution and path parameter interpolation.
 *
 * Supports:
 * - RFC 6570 / Express style path parameters (`:id`, `{id}`)
 * - Relative vs absolute URL resolution against `baseURL`
 * - Query parameter merging with preservation of existing query strings
 *
 * @module url
 */

import type { PathParams, QueryParams } from './types.js';

/**
 * Interpolates path parameters into a URL template string.
 * Supports both Express-style (`:param`) and OpenAPI-style (`{param}`) placeholders.
 * Parameter values are automatically URI-encoded.
 *
 * @param url The URL template string (e.g. `/users/:id/orders/{orderId}`).
 * @param pathParams Object containing the parameter key/value mappings.
 * @returns The interpolated URL string.
 *
 * @example
 * ```ts
 * interpolatePath('/users/:id/posts/{slug}', { id: 42, slug: 'my first post' });
 * // returns: '/users/42/posts/my%20first%20post'
 * ```
 */
export function interpolatePath(url: string, pathParams?: PathParams): string {
  if (!pathParams || Object.keys(pathParams).length === 0) {
    return url;
  }

  let result = url;

  for (const [key, val] of Object.entries(pathParams)) {
    if (val !== undefined && val !== null) {
      const encoded = encodeURIComponent(String(val));
      // Replace :paramName
      const colonPattern = new RegExp(`:${key}(?=[/?#]|$)`, 'g');
      result = result.replace(colonPattern, encoded);
      // Replace {paramName}
      const bracePattern = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(bracePattern, encoded);
    }
  }

  return result;
}

/**
 * Checks whether a URL is absolute (protocol-relative or has a valid URI scheme followed by `://`).
 * Implemented without backtracking regular expressions to prevent ReDoS (CWE-1333).
 *
 * @param url The URL string to test.
 * @returns True if the URL is absolute or protocol-relative.
 */
export function isAbsoluteUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  if (url.startsWith('//')) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url);
}

/**
 * Determines whether two URLs share the exact same protocol, hostname, and port.
 *
 * @param url1 First URL string to compare.
 * @param url2 Second URL string to compare.
 * @returns True if both URLs share the same origin.
 */
export function isSameOrigin(url1: string, url2: string): boolean {
  try {
    const origin1 = new URL(url1, 'http://localhost').origin;
    const origin2 = new URL(url2, 'http://localhost').origin;
    return origin1.toLowerCase() === origin2.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Strips leading forward slashes without regex backtracking.
 */
function trimLeadingSlashes(str: string): string {
  let start = 0;
  while (start < str.length && str.charCodeAt(start) === 47 /* '/' */) {
    start++;
  }
  return str.slice(start);
}

/**
 * Strips trailing forward slashes without regex backtracking.
 */
function trimTrailingSlashes(str: string): string {
  let end = str.length;
  while (end > 0 && str.charCodeAt(end - 1) === 47 /* '/' */) {
    end--;
  }
  return str.slice(0, end);
}

/**
 * Builds a resolved URL from a base URL, a relative/absolute URL, query parameters,
 * and path parameters.
 *
 * @param url The relative or absolute target URL.
 * @param baseURL Optional base URL prepended if url is relative.
 * @param params Optional query parameters to serialize onto the query string.
 * @param pathParams Optional path parameters to interpolate into template placeholders.
 * @returns Fully qualified resolved URL string.
 */
export function buildUrl(
  url = '',
  baseURL?: string,
  params?: QueryParams,
  pathParams?: PathParams,
): string {
  // Step 1: Interpolate path parameters if provided
  let resolvedUrl = interpolatePath(url, pathParams);

  // Step 2: Resolve base URL if provided and url is not already absolute
  if (baseURL && !isAbsoluteUrl(resolvedUrl)) {
    const cleanBase = trimTrailingSlashes(baseURL);
    const cleanPath = trimLeadingSlashes(resolvedUrl);
    resolvedUrl = cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  // Step 3: Append query params
  if (params) {
    const hashIndex = resolvedUrl.indexOf('#');
    let urlWithoutHash = resolvedUrl;
    let hash = '';
    if (hashIndex !== -1) {
      urlWithoutHash = resolvedUrl.slice(0, hashIndex);
      hash = resolvedUrl.slice(hashIndex);
    }

    const searchParams = new URLSearchParams();
    const [base, search] = urlWithoutHash.split('?');

    // Preserve existing query params
    if (search) {
      const existing = new URLSearchParams(search);
      existing.forEach((val, key) => searchParams.append(key, val));
    }

    // Add new query params
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item !== null && item !== undefined) {
              searchParams.append(key, String(item));
            }
          }
        } else {
          searchParams.append(key, String(value));
        }
      }
    }

    const qs = searchParams.toString();
    const withQuery = qs ? `${base}?${qs}` : base || '';
    return hash ? `${withQuery}${hash}` : withQuery;
  }

  return resolvedUrl;
}
