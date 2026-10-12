import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
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
      expect(progressEvents[0]?.loaded).toBeGreaterThan(0);
      expect(progressEvents[0]?.total).toBe(progressEvents[0]?.loaded);
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
});
