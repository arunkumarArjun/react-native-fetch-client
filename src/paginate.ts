/**
 * Auto-Pagination Traverser for react-native-fetch-client.
 *
 * Provides async generator iteration over paginated REST endpoints supporting:
 * - Page number pagination (`page=1, 2, 3...`)
 * - Offset / Limit pagination (`offset=0, 20, 40...`)
 * - Cursor-based pagination (`cursor=abc...`)
 * - RFC 5988 / RFC 8288 standard `Link` header pagination (`rel="next"`)
 *
 * @module paginate
 */

import type {
  HttpClient,
  HttpResponse,
  PaginateHelper,
  PaginateOptions,
  PaginationConfig,
  QueryParams,
} from './types.js';
import { isAbsoluteUrl, isSameOrigin } from './url.js';
import { ConfigError } from './errors.js';

/**
 * Parses an RFC 5988 / RFC 8288 `Link` header and extracts the URL for `rel="next"`.
 * Example header: `<https://api.example.com/items?page=2>; rel="next", <...>; rel="last"`
 */
export function parseNextLinkHeader(header?: string): string | null {
  if (!header) return null;
  const parts = header.split(',');
  for (const part of parts) {
    const section = part.split(';');
    if (section.length >= 2) {
      const urlMatch = section[0]?.trim().match(/^<([^>]+)>/);
      const relMatch = section[1]?.trim().match(/rel=["']?([^"']+)["']?/i);
      if (urlMatch && relMatch && relMatch[1]?.toLowerCase() === 'next') {
        return urlMatch[1] ?? null;
      }
    }
  }
  return null;
}

/**
 * Extracts items array from response data.
 * Checks for direct array, or common wrapper properties like `items`, `data`, `results`, `records`.
 */
function defaultExtractItems<T>(data: T): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'records', 'rows', 'elements']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as unknown[];
      }
    }
    // Fallback: search for first array property
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        return val;
      }
    }
  }
  return [];
}

/**
 * Creates the PaginateHelper bound to an HttpClient instance.
 */
export function createPaginateHelper(
  client: { get: HttpClient['get'] } | HttpClient,
  defaultBaseURL?: string,
): PaginateHelper {
  /**
   * Async generator yielding pages of HttpResponse<TResponse>.
   */
  async function* pagesGenerator<TResponse = unknown>(
    initialUrl: string,
    options?: PaginateOptions<TResponse>,
  ): AsyncGenerator<HttpResponse<TResponse>, void, unknown> {
    const cfg: PaginationConfig<TResponse> = options?.pagination ?? {};
    const strategy = cfg.type ?? 'page';
    const pageParam = cfg.pageParam ?? cfg.param ?? 'page';
    const pageSizeParam = cfg.pageSizeParam ?? cfg.limitParam ?? 'limit';
    const pageSize = cfg.pageSize ?? cfg.limit;
    const offsetParam = cfg.offsetParam ?? 'offset';
    const cursorParam = cfg.cursorParam ?? 'cursor';
    const maxPages = cfg.maxPages ?? cfg.totalPages ?? 50;

    let currentPage = cfg.initialPage ?? 1;
    let currentOffset = cfg.initialOffset ?? 0;
    let currentCursor: string | number | null | undefined = cfg.initialCursor;
    let currentUrl: string | null = initialUrl;
    let pageCount = 0;

    while (currentUrl && pageCount < maxPages) {
      pageCount++;

      // Build merged query parameters for this page
      const pageParams: QueryParams = {
        ...(options?.params ?? {}),
      };

      if (strategy === 'page') {
        pageParams[pageParam] = currentPage;
        if (pageSize !== undefined) {
          pageParams[pageSizeParam] = pageSize;
        }
      } else if (strategy === 'offset') {
        pageParams[offsetParam] = currentOffset;
        if (pageSize !== undefined) {
          pageParams[pageSizeParam] = pageSize;
        }
      } else if (strategy === 'cursor') {
        if (currentCursor !== undefined && currentCursor !== null) {
          pageParams[cursorParam] = currentCursor;
        }
        if (pageSize !== undefined) {
          pageParams[pageSizeParam] = pageSize;
        }
      }

      const res: HttpResponse<TResponse> = await client.get<TResponse>(currentUrl, {
        ...options,
        params: pageParams,
      });

      yield res;

      // Determine next URL or query parameters with cross-origin SSRF guard
      let nextCandidateUrl: string | null = null;
      if (cfg.getNextUrl) {
        nextCandidateUrl = cfg.getNextUrl(res) ?? null;
      } else if (strategy === 'linkHeader' || (!cfg.type && res.headers['link'])) {
        nextCandidateUrl = parseNextLinkHeader(res.headers['link']);
      }

      if (nextCandidateUrl) {
        const allowCrossOrigin = Boolean(
          typeof options?.auth === 'object' && options?.auth?.allowCrossOrigin,
        );
        const baseOriginUrl = isAbsoluteUrl(initialUrl)
          ? initialUrl
          : defaultBaseURL && isAbsoluteUrl(defaultBaseURL)
            ? defaultBaseURL
            : undefined;

        if (
          isAbsoluteUrl(nextCandidateUrl) &&
          baseOriginUrl &&
          !isSameOrigin(baseOriginUrl, nextCandidateUrl) &&
          !allowCrossOrigin
        ) {
          throw new ConfigError(
            `Cross-origin pagination to "${nextCandidateUrl}" blocked from origin "${baseOriginUrl}". To allow cross-origin pagination, set auth.allowCrossOrigin: true in request options.`,
          );
        }
        currentUrl = nextCandidateUrl;
      } else if (cfg.getNextUrl || strategy === 'linkHeader' || (!cfg.type && res.headers['link'])) {
        currentUrl = null;
      } else if (strategy === 'cursor') {
        if (cfg.getNextCursor) {
          currentCursor = cfg.getNextCursor(res);
        } else if (res.data && typeof res.data === 'object') {
          const obj = res.data as Record<string, unknown>;
          currentCursor = (obj['nextCursor'] ?? obj['next_cursor'] ?? obj['cursor']) as
            string | number | null | undefined;
        } else {
          currentCursor = null;
        }

        if (!currentCursor) {
          currentUrl = null;
        }
      } else if (strategy === 'offset') {
        const step = pageSize ?? 10;
        currentOffset += step;
        const items = cfg.getItems ? cfg.getItems(res.data) : defaultExtractItems(res.data);
        if (items.length === 0 || (pageSize !== undefined && items.length < pageSize)) {
          currentUrl = null;
        }
      } else {
        // Strategy === 'page'
        currentPage++;
        const items = cfg.getItems ? cfg.getItems(res.data) : defaultExtractItems(res.data);
        if (items.length === 0 || (pageSize !== undefined && items.length < pageSize)) {
          currentUrl = null;
        }
      }
    }
  }

  /**
   * Primary generator yielding items individually.
   */
  async function* itemsGenerator<TItem = unknown, TResponse = unknown>(
    url: string,
    options?: PaginateOptions<TResponse>,
  ): AsyncGenerator<TItem, void, unknown> {
    const cfg = options?.pagination;
    const customGetItems = cfg?.getItems;
    const extractFn = customGetItems
      ? (d: TResponse) => customGetItems(d)
      : (d: TResponse) => defaultExtractItems(d);

    for await (const page of pagesGenerator<TResponse>(url, options)) {
      const items = extractFn(page.data) as TItem[];
      for (const item of items) {
        yield item;
      }
    }
  }

  /**
   * Collects all paginated items across all pages into an array.
   */
  async function all<TItem = unknown, TResponse = unknown>(
    url: string,
    options?: PaginateOptions<TResponse>,
  ): Promise<TItem[]> {
    const results: TItem[] = [];
    for await (const item of itemsGenerator<TItem, TResponse>(url, options)) {
      results.push(item);
    }
    return results;
  }

  const helper = itemsGenerator as unknown as PaginateHelper;
  helper.pages = pagesGenerator;
  helper.all = all;

  return helper;
}
