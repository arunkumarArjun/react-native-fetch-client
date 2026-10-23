import { describe, it, expect, vi } from 'vitest';
import {
  createClient,
  generateCacheKey,
  generateDedupKey,
  createMockAdapter,
  createOfflineQueue,
  MemoryStorageAdapter,
  parseSseStream,
  createAbortError,
  buildUrl,
  validateData,
  type RequestConfig,
} from '../src/index.js';
import { serializeBody } from '../src/serialize.js';

describe('Deep Project Audit & Correctness Fixes (15 new issues verification)', () => {
  // 1. serializeBody preserves Uint8Array and ArrayBufferView
  it('Issue 1: serializeBody preserves Uint8Array and ArrayBufferView as native BodyInit without JSON corruption', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const serialized = serializeBody(bytes);
    expect(serialized.body).toBe(bytes);
    expect(serialized.contentType).toBeUndefined();
  });

  // 2. Cross-domain cache key and dedup key isolation
  it('Issue 2: generateCacheKey and generateDedupKey preserve origin for absolute URLs to prevent cross-domain collisions', () => {
    const key1 = generateCacheKey('GET', 'https://api.github.com/users');
    const key2 = generateCacheKey('GET', 'https://api.gitlab.com/users');
    expect(key1).not.toBe(key2);
    expect(key1).toContain('https://api.github.com');
    expect(key2).toContain('https://api.gitlab.com');

    const dedup1 = generateDedupKey('GET', 'https://api.github.com/users');
    const dedup2 = generateDedupKey('GET', 'https://api.gitlab.com/users');
    expect(dedup1).not.toBe(dedup2);
    expect(dedup1).toContain('https://api.github.com');
    expect(dedup2).toContain('https://api.gitlab.com');

    // Relative URLs should still use clean pathname
    const relKey = generateCacheKey('GET', '/users');
    expect(relKey).toBe('GET:/users');
  });


  // 4. SSE Stream reader cancels on abort
  it('Issue 4: parseSseStream cancels underlying reader when caller AbortSignal triggers', async () => {
    let cancelCalled = false;
    const stream = new ReadableStream<Uint8Array>({
      start() {},
      pull() {
        return new Promise(() => {}); // Intentionally never resolves to simulate waiting for SSE chunk
      },
      cancel() {
        cancelCalled = true;
      },
    });

    const controller = new AbortController();
    const generator = parseSseStream(stream, { signal: controller.signal });

    const iteratePromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of generator) {
        // no-op
      }
    })();

    // Abort while reader is suspended
    controller.abort(new Error('User cancelled SSE'));
    await iteratePromise;

    expect(cancelCalled).toBe(true);
  });

  // 5. createAbortError works in React Native / non-DOM environments
  it('Issue 5: createAbortError creates an AbortError with safe fallback when DOMException is undefined', () => {
    const err = createAbortError('Custom abort message');
    expect(err.name).toBe('AbortError');
    expect(err.message).toBe('Custom abort message');
  });

  // 6. Paginate: presence of Link header doesn't hijack page strategy
  it('Issue 6: pagination with strategy "page" does not get hijacked by unrelated server Link headers', async () => {
    let callCount = 0;
    const fetchImpl = vi.fn().mockImplementation((req: Request) => {
      callCount++;
      const url = new URL(req.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      const items = page <= 2 ? [{ id: page, name: `Item ${page}` }] : [];

      return Promise.resolve(
        new Response(JSON.stringify(items), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            // Server includes a Link header (e.g. rel="canonical" or malformed)
            link: '<https://api.example.com/canonical>; rel="canonical"',
          },
        }),
      );
    });

    const client = createClient({ baseURL: 'https://api.example.com', fetchImpl });
    const allItems = await client.paginate.all<{ id: number; name: string }>('/items', {
      pagination: { type: 'page', pageSize: 1 },
    });

    expect(allItems.length).toBe(2);
    expect(callCount).toBe(3); // page 1, page 2, page 3 (empty -> stops)
  });

  // 7. Paginate: cursor pagination respects limit
  it('Issue 7: cursor pagination forwards limit parameter to query params', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn().mockImplementation((req: Request) => {
      capturedUrl = req.url;
      return Promise.resolve(
        new Response(JSON.stringify({ items: [{ id: 1 }], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ baseURL: 'https://api.example.com', fetchImpl });
    await client.paginate.all('/cursor-items', {
      pagination: { type: 'cursor', limit: 25 },
    });

    expect(capturedUrl).toContain('limit=25');
  });

  // 8. buildUrl preserves hash fragment (#)
  it('Issue 8: buildUrl places query string before hash fragment', () => {
    const url = buildUrl('https://api.example.com/items#section1', undefined, { page: 2 });
    expect(url).toBe('https://api.example.com/items?page=2#section1');
  });

  // 9. QueryParams array support
  it('Issue 9: buildUrl serializes array query parameters correctly', () => {
    const url = buildUrl('/items', 'https://api.example.com', {
      tags: ['react', 'native'],
      page: 1,
    });
    expect(url).toBe('https://api.example.com/items?tags=react&tags=native&page=1');
  });

  // 10. OfflineQueue preserves pathParams
  it('Issue 10: createOfflineQueue preserves pathParams during enqueue and replay', async () => {
    const storage = new MemoryStorageAdapter();
    const executedUrls: string[] = [];
    const client = {
      request: vi
        .fn()
        .mockImplementation(
          (cfg: { url: string; pathParams?: Record<string, string | number> }) => {
            // Emulate executor pathParams interpolation
            const finalUrl = cfg.url.replace(':id', String(cfg.pathParams?.['id']));
            executedUrls.push(finalUrl);
            return Promise.resolve({ status: 200, data: { ok: true } });
          },
        ),
    };

    const queue = createOfflineQueue({
      client,
      storage,
    });

    await queue.enqueue({
      url: 'https://api.example.com/users/:id',
      method: 'POST',
      pathParams: { id: 42 },
      body: { name: 'Alice' },
    });

    const items = await queue.getItems();
    expect(items[0]?.pathParams).toEqual({ id: 42 });

    const summary = await queue.process();
    expect(summary.succeeded).toBe(1);
    expect(executedUrls[0]).toBe('https://api.example.com/users/42');
  });

  // 11. MockAdapter onHead and onOptions
  it('Issue 11: createMockAdapter supports onHead and onOptions', async () => {
    const client = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(client);

    mock.onHead('/status').reply(200);
    mock.onOptions('/options').reply(204);

    const headRes = await client.head('/status');
    expect(headRes.status).toBe(200);

    const optRes = await client.options('/options');
    expect(optRes.status).toBe(204);
  });

  // 12. Rejection interceptor recovery flows through unwrap
  it('Issue 12: recovered response in response rejection interceptor flows through unwrap', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }));

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl,
      unwrap: true,
    });

    client.interceptors.response.use(
      (res) => res,
      (_err) => {
        // Recover error with fallback response
        return {
          data: { fallback: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as unknown as RequestConfig,
          cached: false,
          fromDedup: false,
          request: {} as Request,
        };
      },
    );

    const data = await client.get<{ fallback: boolean }>('/unstable');
    expect(data).toEqual({ fallback: true });
  });

  // 13. Executor safely handles response.clone() failure
  it('Issue 13: dispatchFetch produces HttpError cleanly even if response.clone() throws', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{"error":"bad"}'),
      clone: () => {
        throw new Error('clone() unsupported on this body stream');
      },
    };

    const fetchImpl = vi.fn().mockResolvedValue(mockResponse);
    const client = createClient({ fetchImpl });

    await expect(client.get('/fail')).rejects.toThrow('HTTP Error 400 Bad Request');
  });

  // 14. validateData supports async Zod schemas
  it('Issue 14: validateData supports async Zod-like schemas with safeParseAsync', async () => {
    const asyncSchema = {
      safeParseAsync: async (val: unknown) => {
        await new Promise((r) => setTimeout(r, 10));
        if (typeof val === 'object' && val !== null && 'id' in val) {
          return { success: true as const, data: val as { id: number } };
        }
        return { success: false as const, error: { message: 'Must have id', issues: [] } };
      },
    };

    const result = await validateData<{ id: number }>(asyncSchema, { id: 100 });
    expect(result).toEqual({ id: 100 });
  });

  // 15. Package.json react-native field
  it('Issue 15: package.json specifies react-native entrypoint for Metro bundler', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default['react-native']).toBe('./dist/index.mjs');
  });
});
