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
  if (baseURL && !/^([a-z][a-z0-9+\-.]*:)?\/\//i.test(resolvedUrl)) {
    const cleanBase = baseURL.replace(/\/+$/, '');
    const cleanPath = resolvedUrl.replace(/^\/+/, '');
    resolvedUrl = cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  // Step 3: Append query params
  if (params) {
    const searchParams = new URLSearchParams();
    const [base, search] = resolvedUrl.split('?');

    // Preserve existing query params
    if (search) {
      const existing = new URLSearchParams(search);
      existing.forEach((val, key) => searchParams.append(key, val));
    }

    // Add new query params
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    }

    const qs = searchParams.toString();
    return qs ? `${base}?${qs}` : base || '';
  }

  return resolvedUrl;
}
