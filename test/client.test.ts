import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { HttpError, NetworkError, TimeoutError, CancelError } from '../src/errors.js';

describe('Client and Executor', () => {
  it('makes a successful GET request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
    const client = createClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    const res = await client.get('/test', { baseURL: 'http://localhost' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = mockFetch.mock.calls[0]![0] as Request;
    expect(req.url).toBe('http://localhost/test');
    expect(req.method).toBe('GET');
    expect(res.data).toEqual({ id: 1 });
    expect(res.status).toBe(200);
  });

  it('makes a successful POST request with JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    const client = createClient({
      fetchImpl: mockFetch as unknown as typeof fetch,
      baseURL: 'http://localhost',
    });

    const res = await client.post('/data', { foo: 'bar' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const req = mockFetch.mock.calls[0]![0] as Request;
    expect(req.url).toBe('http://localhost/data');
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(res.data).toEqual({ success: true });
  });

  it('throws HttpError on non-2xx', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('Not Found', { status: 404, statusText: 'Not Found' }));
    const client = createClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    await expect(client.get('http://localhost/404')).rejects.toThrow(HttpError);
  });

  it('throws NetworkError on fetch rejection', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    await expect(client.get('http://localhost/network')).rejects.toThrow(NetworkError);
  });

  it('supports timeout', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const client = createClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    await expect(client.get('http://localhost/timeout', { timeout: 10 })).rejects.toThrow(
      TimeoutError,
    );
  });

  it('supports cancellation via AbortSignal', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      return new Promise((resolve, reject) => {
        req.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    const client = createClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    const controller = new AbortController();
    const reqPromise = client.get('http://localhost/cancel', { signal: controller.signal });

    setTimeout(() => controller.abort(), 10);

    await expect(reqPromise).rejects.toThrow(CancelError);
  });

  it('throws friendly ConfigError when fetch is unavailable in runtime', async () => {
    // Simulate runtime without global fetch (e.g. Node 14/16)
    const client = createClient({ fetchImpl: undefined as unknown as typeof fetch });
    const originalFetch = globalThis.fetch;
    // @ts-expect-error simulating legacy environment
    delete globalThis.fetch;

    try {
      await expect(client.get('http://localhost/test')).rejects.toThrow(
        /globalThis\.fetch is not available in this environment.*Node\.js >= 18\.0\.0/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
