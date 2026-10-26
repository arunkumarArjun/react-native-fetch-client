/**
 * Declarative Mock Adapter for react-native-fetch-client.
 *
 * Enables straightforward unit testing and route stubbing without external libraries
 * like MSW or nock. Intercepts outgoing requests, returns simulated responses or
 * simulated network errors, and records complete request history.
 *
 * @module mock
 */

import { TimeoutError } from './errors.js';
import type {
  HttpClient,
  HttpMethod,
  MockAdapter,
  MockHandler,
  MockHistoryItem,
  MockReplyCallback,
  RequestConfig,
} from './types.js';

export type { MockAdapter, MockHandler, MockHistoryItem, MockReplyCallback };

interface InternalMockHandler extends MockHandler {
  action: 'reply' | 'timeout' | 'networkError';
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
  callback?: MockReplyCallback;
  errorMessage?: string;
}

/**
 * Creates an active mock adapter attached to an HttpClient instance.
 *
 * @param client The HttpClient instance to mock.
 * @param options Options including delay simulation or passthrough for unmatched routes.
 *
 * @example
 * ```ts
 * const mock = createMockAdapter(api);
 * mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice' });
 * mock.onPost('/login').reply(401, { error: 'Invalid credentials' });
 *
 * const res = await api.get('/users/1');
 * expect(res.data.name).toBe('Alice');
 * expect(mock.history.get.length).toBe(1);
 * ```
 */
export function createMockAdapter(
  client: HttpClient,
  options?: { delayMs?: number; passthrough?: boolean },
): MockAdapter {
  const handlers: InternalMockHandler[] = [];
  const history: Record<Lowercase<HttpMethod> | 'all', MockHistoryItem[]> = {
    get: [],
    post: [],
    put: [],
    patch: [],
    delete: [],
    head: [],
    options: [],
    all: [],
  };

  /**
   * Evaluates if a request URL matches the handler matcher (string or RegExp).
   */
  function matchesUrl(pattern: string | RegExp, targetUrl: string): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(targetUrl);
    }
    if (targetUrl === pattern) {
      return true;
    }
    try {
      const parsed = new URL(targetUrl, 'http://localhost');
      return (
        parsed.pathname === pattern ||
        parsed.pathname + parsed.search === pattern ||
        targetUrl.includes(pattern)
      );
    } catch {
      return targetUrl.includes(pattern);
    }
  }

  /**
   * Helper constructing a MockHandler for a given method and URL pattern.
   */
  function registerHandler(method: HttpMethod | 'ANY', url: string | RegExp = ''): MockHandler {
    const handler: InternalMockHandler = {
      method,
      url,
      action: 'reply',
      status: 200,
      reply(
        statusOrCallback: number | MockReplyCallback,
        data?: unknown,
        headers?: Record<string, string>,
      ) {
        if (typeof statusOrCallback === 'function') {
          handler.action = 'reply';
          handler.callback = statusOrCallback;
        } else {
          handler.action = 'reply';
          handler.status = statusOrCallback;
          handler.data = data;
          if (headers !== undefined) {
            handler.headers = headers;
          }
        }
      },
      replyWithTimeout() {
        handler.action = 'timeout';
      },
      replyWithNetworkError(message?: string) {
        handler.action = 'networkError';
        handler.errorMessage = message ?? 'Network request failed';
      },
    };

    handlers.push(handler);
    return handler;
  }

  /**
   * Mock Fetch implementation injected into the request pipeline.
   */
  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (options?.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    let urlString: string;
    let method: HttpMethod = (init?.method?.toUpperCase() as HttpMethod) ?? 'GET';

    if (typeof input === 'string') {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.toString();
    } else {
      urlString = input.url;
      method = (input.method.toUpperCase() as HttpMethod) ?? method;
    }

    // Capture in history
    const historyItem: MockHistoryItem = {
      url: urlString,
      method,
    };
    if (init?.headers) {
      const hdrs: Record<string, string> = {};
      if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          hdrs[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) {
          hdrs[k] = v;
        }
      } else {
        Object.assign(hdrs, init.headers);
      }
      historyItem.headers = hdrs;
    }
    if (init?.body) {
      historyItem.body = init.body;
    }

    const lowerMethod = method.toLowerCase() as Lowercase<HttpMethod>;
    if (history[lowerMethod]) {
      history[lowerMethod].push(historyItem);
    }
    history.all.push(historyItem);

    // Find first matching registered handler (latest registered first)
    let matched: InternalMockHandler | undefined;
    for (let i = handlers.length - 1; i >= 0; i--) {
      const h = handlers[i];
      if (!h) continue;
      if (h.method === 'ANY' || h.method === method) {
        if (!h.url || matchesUrl(h.url, urlString)) {
          matched = h;
          break;
        }
      }
    }

    if (!matched) {
      if (options?.passthrough && typeof globalThis.fetch === 'function') {
        return globalThis.fetch(input, init);
      }
      return new Response(
        JSON.stringify({
          error: `[react-native-fetch-client-mock] No mock handler registered for ${method} ${urlString}`,
        }),
        {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    if (matched.action === 'timeout') {
      throw new TimeoutError(0);
    }

    if (matched.action === 'networkError') {
      throw new TypeError(matched.errorMessage ?? 'Network request failed');
    }

    // matched.action === 'reply'
    let status = matched.status ?? 200;
    let data = matched.data;
    let headers = matched.headers ?? {};

    if (matched.callback) {
      const reqConfig: RequestConfig & { url: string; method: HttpMethod } = {
        url: urlString,
        method,
      };
      if (init?.body !== undefined) {
        reqConfig.body = init.body as NonNullable<RequestConfig['body']>;
      }
      const cbResult = await matched.callback(reqConfig);
      status = cbResult[0];
      if (cbResult[1] !== undefined) data = cbResult[1];
      if (cbResult[2] !== undefined) headers = cbResult[2];
    }

    let bodyText = '';
    if (typeof data === 'string') {
      bodyText = data;
    } else if (data !== undefined && data !== null) {
      bodyText = JSON.stringify(data);
    }

    const resHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...headers,
    };

    const isNullBodyStatus = status === 204 || status === 205 || status === 304;

    return new Response(isNullBodyStatus ? null : bodyText, {
      status,
      statusText: status === 200 ? 'OK' : 'Mock Response',
      headers: resHeaders,
    });
  };

  // Attach request interceptor that injects mockFetch
  const interceptorId = client.interceptors.request.use((config) => {
    config.fetchImpl = mockFetch;
    return config;
  });

  return {
    onGet: (url = '') => registerHandler('GET', url),
    onPost: (url = '') => registerHandler('POST', url),
    onPut: (url = '') => registerHandler('PUT', url),
    onPatch: (url = '') => registerHandler('PATCH', url),
    onDelete: (url = '') => registerHandler('DELETE', url),
    onHead: (url = '') => registerHandler('HEAD', url),
    onOptions: (url = '') => registerHandler('OPTIONS', url),
    onAny: (url = '') => registerHandler('ANY', url),
    reset() {
      handlers.length = 0;
      this.resetHistory();
    },
    resetHandlers() {
      handlers.length = 0;
    },
    resetHistory() {
      for (const key of Object.keys(history)) {
        history[key as keyof typeof history].length = 0;
      }
    },
    restore() {
      client.interceptors.request.eject(interceptorId);
      this.reset();
    },
    history,
  };
}
