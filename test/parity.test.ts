import { describe, it, expect, vi } from 'vitest';
import defaultClient, { createClient } from '../src/index.js';
import type { ProgressEvent } from '../src/types.js';

describe('Axios Parity Features', () => {
  describe('Automatic URL-Encoded Form Serialization', () => {
    it('serializes plain objects to application/x-www-form-urlencoded when header is set', async () => {
      let capturedBody: string | null = null;
      let capturedContentType: string | null = null;

      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        capturedContentType = req.headers.get('content-type');
        return req.text().then((text) => {
          capturedBody = text;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        });
      });

      const client = createClient({ fetchImpl: mockFetch });

      await client.post(
        'http://localhost/form',
        { username: 'alice', role: 'admin' },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      expect(capturedContentType).toContain('application/x-www-form-urlencoded');
      expect(capturedBody).toBe('username=alice&role=admin');
    });

    it('serializes plain objects to url-encoded when formUrlEncoded: true is set', async () => {
      let capturedBody: string | null = null;
      let capturedContentType: string | null = null;

      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        capturedContentType = req.headers.get('content-type');
        return req.text().then((text) => {
          capturedBody = text;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        });
      });

      const client = createClient({ fetchImpl: mockFetch });

      await client.post(
        'http://localhost/form',
        { grant_type: 'password', scope: 'read write' },
        {
          formUrlEncoded: true,
        },
      );

      expect(capturedContentType).toContain('application/x-www-form-urlencoded');
      expect(capturedBody).toBe('grant_type=password&scope=read+write');
    });
  });

  describe('Download Progress (onDownloadProgress)', () => {
    it('emits progress events with loaded, total, and progress ratio', async () => {
      const progressEvents: ProgressEvent[] = [];

      // Create a ReadableStream with 3 chunks
      const chunks = [
        new TextEncoder().encode('chunk1-'),
        new TextEncoder().encode('chunk2-'),
        new TextEncoder().encode('chunk3!'),
      ];
      const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);

      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/plain',
            'content-length': String(totalBytes),
          },
        }),
      );

      const client = createClient({ fetchImpl: mockFetch });

      const res = await client.get<string>('http://localhost/download', {
        responseType: 'text',
        onDownloadProgress: (event) => {
          progressEvents.push({ ...event });
        },
      });

      expect(res.data).toBe('chunk1-chunk2-chunk3!');
      expect(progressEvents.length).toBe(3);
      expect(progressEvents[0]?.bytes).toBe(chunks[0]!.length);
      expect(progressEvents[2]?.loaded).toBe(totalBytes);
      expect(progressEvents[2]?.total).toBe(totalBytes);
      expect(progressEvents[2]?.progress).toBe(1);
    });

    it('emits progress even when Content-Length is absent', async () => {
      const progressEvents: ProgressEvent[] = [];

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('indeterminate'));
          controller.close();
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/plain' }, // No content-length
        }),
      );

      const client = createClient({ fetchImpl: mockFetch });

      await client.get<string>('http://localhost/indeterminate', {
        responseType: 'text',
        onDownloadProgress: (event) => {
          progressEvents.push({ ...event });
        },
      });

      expect(progressEvents.length).toBe(1);
      expect(progressEvents[0]?.loaded).toBe(13);
      expect(progressEvents[0]?.total).toBeUndefined();
      expect(progressEvents[0]?.progress).toBeUndefined();
    });
  });

  describe('Upload Progress (onUploadProgress)', () => {
    it('notifies upload progress for outgoing payload', async () => {
      const progressEvents: ProgressEvent[] = [];
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

      const client = createClient({ fetchImpl: mockFetch });

      await client.post(
        'http://localhost/upload',
        { data: 'my-payload' },
        {
          onUploadProgress: (event) => {
            progressEvents.push({ ...event });
          },
        },
      );

      expect(progressEvents.length).toBeGreaterThan(0);
      const lastEvent = progressEvents[progressEvents.length - 1];
      expect(lastEvent?.loaded).toBeGreaterThan(0);
      expect(lastEvent?.total).toBe(lastEvent?.loaded);
    });
  });

  describe('Redirect and Dispatcher Passthrough', () => {
    it('forwards redirect policy to RequestInit', async () => {
      let capturedRedirect: RequestRedirect | undefined;

      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        capturedRedirect = req.redirect;
        return Promise.resolve(new Response('OK', { status: 200 }));
      });

      const client = createClient({ fetchImpl: mockFetch });

      await client.get('http://localhost/redirect', { redirect: 'manual', responseType: 'text' });
      expect(capturedRedirect).toBe('manual');
    });

    it('forwards dispatcher to RequestInit in Node environments', async () => {
      let capturedDispatcher: unknown;

      const mockFetch = vi
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          capturedDispatcher = (init as Record<string, unknown> | undefined)?.dispatcher;
          return Promise.resolve(new Response('OK', { status: 200 }));
        });

      const client = createClient({ fetchImpl: mockFetch });
      const customDispatcher = { mockProxy: true };

      await client.get('http://localhost/proxy', {
        dispatcher: customDispatcher,
        responseType: 'text',
      });
      expect(capturedDispatcher).toBe(customDispatcher);
    });
  });

  describe('baseUrl and baseURL Flexibility', () => {
    it('accepts baseUrl (lowercase) at client level', async () => {
      let requestedUrl = '';
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        requestedUrl = req.url;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const client = createClient({
        baseUrl: 'https://api.example.com/v1',
        fetchImpl: mockFetch,
      });

      await client.get('/products');
      expect(requestedUrl).toBe('https://api.example.com/v1/products');
    });

    it('accepts baseUrl (lowercase) at per-request level overriding client config', async () => {
      let requestedUrl = '';
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        requestedUrl = req.url;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      });

      const client = createClient({
        baseURL: 'https://api.default.com',
        fetchImpl: mockFetch,
      });

      await client.get('/override', { baseUrl: 'https://api.override.com' });
      expect(requestedUrl).toBe('https://api.override.com/override');
    });
  });

  describe('del() Alias for delete()', () => {
    it('executes DELETE request using client.del()', async () => {
      let requestedMethod = '';
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        requestedMethod = req.method;
        return Promise.resolve(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
      });

      const client = createClient({ fetchImpl: mockFetch });
      const res = await client.del('http://localhost/item/1');

      expect(requestedMethod).toBe('DELETE');
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ deleted: true });
    });

    it('executes safe DELETE request using client.safe.del()', async () => {
      let requestedMethod = '';
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        requestedMethod = req.method;
        return Promise.resolve(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
      });

      const client = createClient({ fetchImpl: mockFetch });
      const [data, err] = await client.safe.del('http://localhost/item/2');

      expect(requestedMethod).toBe('DELETE');
      expect(err).toBeNull();
      expect(data).toEqual({ deleted: true });
    });
  });

  describe('Default Client Export and Factory Alias', () => {
    it('provides a default pre-instantiated client instance', () => {
      expect(defaultClient).toBeDefined();
      expect(typeof defaultClient.get).toBe('function');
      expect(typeof defaultClient.post).toBe('function');
      expect(typeof defaultClient.del).toBe('function');
      expect(typeof defaultClient.delete).toBe('function');
      expect(typeof defaultClient.safe.del).toBe('function');
    });

    it('allows client.create() identical to axios.create()', () => {
      expect(typeof defaultClient.create).toBe('function');
      expect(typeof defaultClient.createClient).toBe('function');

      const custom = defaultClient.create({ baseURL: 'https://api.test.com' });
      expect(typeof custom.get).toBe('function');
      expect(typeof custom.post).toBe('function');
    });
  });
});
