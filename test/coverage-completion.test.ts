import { describe, it, expect, vi } from 'vitest';
import {
  ConcurrencyLimiter,
  createClient,
  parseSseStream,
  AuthManager,
  HttpError,
} from '../src/index.js';
import { parseResponse } from '../src/parse.js';
import { createMockAdapter } from '../src/mock.js';
import type { ResolvedRequestConfig } from '../src/types.js';

describe('Coverage Completion: ConcurrencyLimiter Edge Cases', () => {
  it('executes task immediately when maxConcurrent <= 0', async () => {
    const limiter = new ConcurrencyLimiter(0);
    const result = await limiter.run(() => Promise.resolve('unlimited'));
    expect(result).toBe('unlimited');
  });

  it('tracks pending queue count and clears with custom error', async () => {
    const limiter = new ConcurrencyLimiter(1);
    let releaseFirst: () => void = () => {};

    const p1 = limiter.run(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('first');
        }),
    );

    const p2 = limiter.run(() => Promise.resolve('second'));
    const p3 = limiter.run(() => Promise.resolve('third'));

    expect(limiter.active).toBe(1);
    expect(limiter.pending).toBe(2);

    limiter.clear(new Error('Queue cancelled by test'));

    await expect(p2).rejects.toThrow('Queue cancelled by test');
    await expect(p3).rejects.toThrow('Queue cancelled by test');

    releaseFirst();
    expect(await p1).toBe('first');
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it('rejects immediately when signal is already aborted before acquire', async () => {
    const limiter = new ConcurrencyLimiter(1);
    // Occupy slot
    const blocker = limiter.run(() => new Promise((r) => setTimeout(r, 20)));

    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted'));

    await expect(limiter.run(() => Promise.resolve(42), controller.signal)).rejects.toThrow(
      'Pre-aborted',
    );
    await blocker;
  });
});

describe('Coverage Completion: parseResponse Types & Progress', () => {
  const dummyConfig = {} as unknown as ResolvedRequestConfig;

  it('parses blob responseType', async () => {
    const res = new Response('blob content', {
      headers: { 'content-type': 'text/plain' },
    });
    const blob = (await parseResponse(res, 'blob', dummyConfig)) as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
  });

  it('parses arrayBuffer responseType', async () => {
    const res = new Response('buffer content');
    const ab = (await parseResponse(res, 'arrayBuffer', dummyConfig)) as ArrayBuffer;
    expect(ab.byteLength).toBeGreaterThan(0);
  });

  it('parses stream responseType returning ReadableStream', async () => {
    const res = new Response('stream content');
    const stream = await parseResponse(res, 'stream', dummyConfig);
    expect(stream).toBeDefined();
  });

  it('tracks download progress without content-length header', async () => {
    const progressEvents: unknown[] = [];
    const res = new Response('chunked content');
    const data = await parseResponse(res, 'text', dummyConfig, (evt) => progressEvents.push(evt));
    expect(data).toBe('chunked content');
    expect(progressEvents.length).toBeGreaterThan(0);
  });

  it('returns null for empty body json', async () => {
    const res = new Response('');
    expect(await parseResponse(res, 'json', dummyConfig)).toBeNull();
  });
});

describe('Coverage Completion: parseSseStream Abort Handling', () => {
  it('exits immediately if signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Aborted immediately'));

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: test\n\n'));
        c.close();
      },
    });

    const events: unknown[] = [];
    for await (const evt of parseSseStream(stream, { signal: controller.signal })) {
      events.push(evt);
    }
    expect(events).toHaveLength(0);
  });

  it('aborts during streaming cleanly', async () => {
    const controller = new AbortController();

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: first\n\n'));
        c.close();
      },
    });

    const events: unknown[] = [];
    for await (const evt of parseSseStream(stream, { signal: controller.signal })) {
      events.push(evt);
      controller.abort();
    }
    expect(events).toHaveLength(1);
  });
});

describe('Coverage Completion: Mock Adapter Full Coverage', () => {
  it('supports onPut, onPatch, onDelete, onHead, onOptions, onAny', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onPut('/put-item').reply(200, { action: 'put' });
    mock.onPatch('/patch-item').reply(200, { action: 'patch' });
    mock.onDelete('/delete-item').reply(204, null);
    mock.onHead('/head-item').reply(200);
    mock.onOptions('/options-item').reply(204);
    mock.onAny('/any-item').reply(200, { wildcard: true });

    expect((await client.put('/put-item')).data).toEqual({ action: 'put' });
    expect((await client.patch('/patch-item')).data).toEqual({ action: 'patch' });
    expect((await client.delete('/delete-item')).status).toBe(204);
    expect((await client.head('/head-item')).status).toBe(200);
    expect((await client.options('/options-item')).status).toBe(204);
    expect((await client.get('/any-item')).data).toEqual({ wildcard: true });

    expect(mock.history.put.length).toBe(1);
    expect(mock.history.patch.length).toBe(1);
    expect(mock.history.delete.length).toBe(1);
    expect(mock.history.head.length).toBe(1);
    expect(mock.history.options.length).toBe(1);

    mock.resetHistory();
    expect(mock.history.all.length).toBe(0);

    mock.resetHandlers();
    mock.reset();
  });

  it('supports passthrough option for unmatched routes', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ fromRealNetwork: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    (globalThis as { fetch: typeof globalThis.fetch }).fetch = fetchSpy as typeof globalThis.fetch;

    try {
      const client = createClient();
      const mock = createMockAdapter(client, { passthrough: true });

      mock.onGet('/mocked').reply(200, { mocked: true });

      const mockRes = await client.get('/mocked');
      expect(mockRes.data).toEqual({ mocked: true });

      const realRes = await client.get('https://example.com/real');
      expect(realRes.data).toEqual({ fromRealNetwork: true });
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Coverage Completion: AuthManager Edge Cases', () => {
  it('falls back to existing token when isExpired() throws', async () => {
    const auth = new AuthManager({
      getToken: () => Promise.resolve('fallback-token'),
      refreshToken: () => Promise.resolve('new-token'),
      isExpired: () => Promise.reject(new Error('Expiry check failed')),
    });

    const headers: Record<string, string> = {};
    await auth.attachToken(headers, 'https://api.test/profile');
    expect(headers['authorization']).toBe('Bearer fallback-token');
  });

  it('respects requestAuth: false and requestAuth: { skip: true }', async () => {
    const auth = new AuthManager({
      getToken: () => Promise.resolve('valid-token'),
    });

    const h1: Record<string, string> = {};
    await auth.attachToken(h1, 'https://api.test/public', false);
    expect(h1['authorization']).toBeUndefined();

    const h2: Record<string, string> = {};
    await auth.attachToken(h2, 'https://api.test/public', { skip: true });
    expect(h2['authorization']).toBeUndefined();
  });

  it('does not refresh if isRefreshed is true or requestAuth was skipped', () => {
    const auth = new AuthManager({
      getToken: () => Promise.resolve('token'),
      refreshToken: () => Promise.resolve('new-token'),
    });

    const httpErr = new HttpError('Unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
      data: null,
      headers: {},
      response: new Response(null, { status: 401 }),
    });

    expect(auth.isEligibleForRefresh(httpErr, 'https://api.test/items', true)).toBe(false);
    expect(auth.isEligibleForRefresh(httpErr, 'https://api.test/items', false, false)).toBe(false);
    expect(
      auth.isEligibleForRefresh(httpErr, 'https://api.test/items', false, { skip: true }),
    ).toBe(false);
    expect(
      auth.isEligibleForRefresh(new Error('Generic network failure'), 'https://api.test/items'),
    ).toBe(false);
  });
});

describe('Coverage Completion: SafeHttpClient All Methods', () => {
  it('executes safe post, put, patch, delete, del, head, options, and request', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onPost('/items').reply(201, { id: 1 });
    mock.onPut('/items/1').reply(200, { id: 1, updated: true });
    mock.onPatch('/items/1').reply(200, { id: 1, patched: true });
    mock.onDelete('/items/1').reply(200, { deleted: true });
    mock.onHead('/items/1').reply(200);
    mock.onOptions('/items').reply(204);
    mock.onGet('/fail').reply(500, { error: 'Server error' });

    const [postData, postErr] = await client.safe.post('/items', { name: 'Item' });
    expect(postErr).toBeNull();
    expect(postData).toEqual({ id: 1 });

    const [putData, putErr] = await client.safe.put('/items/1', { name: 'Item Updated' });
    expect(putErr).toBeNull();
    expect(putData).toEqual({ id: 1, updated: true });

    const [patchData, patchErr] = await client.safe.patch('/items/1', { patched: true });
    expect(patchErr).toBeNull();
    expect(patchData).toEqual({ id: 1, patched: true });

    const [delData, delErr] = await client.safe.delete('/items/1');
    expect(delErr).toBeNull();
    expect(delData).toEqual({ deleted: true });

    const [delAliasData] = await client.safe.del('/items/1');
    expect(delAliasData).toEqual({ deleted: true });

    const [, headErr] = await client.safe.head('/items/1');
    expect(headErr).toBeNull();

    const [, optionsErr] = await client.safe.options('/items');
    expect(optionsErr).toBeNull();

    const [failData, failErr] = await client.safe.get('/fail');
    expect(failData).toBeNull();
    expect(failErr).toBeInstanceOf(HttpError);
  });
});
