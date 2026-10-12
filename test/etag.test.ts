import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/index.js';

describe('RFC 7234 Conditional Caching (ETag & 304 Not Modified)', () => {
  it('stores ETag and sends If-None-Match header on subsequent request', async () => {
    let callCount = 0;
    const sentIfNoneMatchHeaders: (string | null)[] = [];

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      callCount++;
      sentIfNoneMatchHeaders.push(req.headers.get('if-none-match'));

      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: 'Alice' }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              etag: '"v1-etag-hash"',
            },
          }),
        );
      }

      // Second request returns 304 Not Modified
      return Promise.resolve(
        new Response(null, {
          status: 304,
          statusText: 'Not Modified',
          headers: {
            etag: '"v1-etag-hash"',
            date: 'Sun, 11 Oct 2026 00:00:00 GMT',
          },
        }),
      );
    });

    const client = createClient({
      fetchImpl: mockFetch,
      cache: { enabled: true, etag: true },
    });

    // 1st request -> 200 OK with ETag
    const res1 = await client.get<{ user: string }>('https://api.test/user');
    expect(res1.data).toEqual({ user: 'Alice' });
    expect(res1.cached).toBe(false);
    expect(sentIfNoneMatchHeaders[0]).toBeNull();

    // Force revalidation on 2nd request via cache: { etag: true }
    const res2 = await client.get<{ user: string }>('https://api.test/user', {
      cache: { etag: true },
    });

    expect(sentIfNoneMatchHeaders[1]).toBe('"v1-etag-hash"');
    expect(res2.cached).toBe(true);
    expect(res2.data).toEqual({ user: 'Alice' });
    expect(res2.headers['date']).toBe('Sun, 11 Oct 2026 00:00:00 GMT');
  });

  it('stores Last-Modified and sends If-Modified-Since header', async () => {
    let callCount = 0;
    let lastModifiedHeaderSent: string | null = null;

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ item: 'Document' }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'last-modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
            },
          }),
        );
      }

      lastModifiedHeaderSent = req.headers.get('if-modified-since');
      return Promise.resolve(
        new Response(null, {
          status: 304,
          statusText: 'Not Modified',
        }),
      );
    });

    const client = createClient({
      fetchImpl: mockFetch,
      cache: { enabled: true, etag: true },
    });

    await client.get('https://api.test/doc');
    const res2 = await client.get('https://api.test/doc', { cache: { etag: true } });

    expect(lastModifiedHeaderSent).toBe('Wed, 21 Oct 2025 07:28:00 GMT');
    expect(res2.cached).toBe(true);
  });
});
