import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import type { RequestConfig, HttpResponse } from '../src/types.js';

describe('Phase 3: Interceptor Pipeline', () => {
  it('modifies request configuration via request interceptor', async () => {
    let capturedAuth = '';
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      capturedAuth = req.headers.get('authorization') ?? '';
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });

    const client = createClient({ fetchImpl: mockFetch });

    client.interceptors.request.use((config: RequestConfig) => {
      return {
        ...config,
        headers: {
          ...config.headers,
          authorization: 'Bearer intercepted-token',
        },
      };
    });

    await client.get('http://localhost/test');
    expect(capturedAuth).toBe('Bearer intercepted-token');
  });

  it('ejects request interceptor when requested', async () => {
    let capturedHeader = '';
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      capturedHeader = req.headers.get('x-custom') ?? '';
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });

    const client = createClient({ fetchImpl: mockFetch });

    const id = client.interceptors.request.use((config: RequestConfig) => {
      return {
        ...config,
        headers: {
          ...config.headers,
          'x-custom': 'active',
        },
      };
    });

    await client.get('http://localhost/test');
    expect(capturedHeader).toBe('active');

    // Eject interceptor
    client.interceptors.request.eject(id);
    capturedHeader = '';

    await client.get('http://localhost/test');
    expect(capturedHeader).toBe('');
  });

  it('transforms response via response interceptor', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({ value: 10 })));
    });

    const client = createClient({ fetchImpl: mockFetch });

    client.interceptors.response.use((res: HttpResponse) => {
      const existing = res.data && typeof res.data === 'object' ? res.data : {};
      return {
        ...res,
        data: {
          ...existing,
          transformed: true,
        },
      };
    });

    const response = await client.get<{ value: number; transformed: boolean }>(
      'http://localhost/test',
    );
    expect(response.data.value).toBe(10);
    expect(response.data.transformed).toBe(true);
  });

  it('recovers from errors via response rejected interceptor', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response('Server error', { status: 500, statusText: 'Error' }));
    });

    const client = createClient({ fetchImpl: mockFetch });

    // Catch 500 and recover with fallback response
    client.interceptors.response.use(
      (res) => res,
      (err) => {
        return {
          data: { fallback: true, error: (err as Error).message },
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: false,
          fromDedup: false,
          config: {} as HttpResponse['config'],
          request: {} as Request,
        };
      },
    );

    const res = await client.get<{ fallback: boolean }>('http://localhost/test');
    expect(res.status).toBe(200);
    expect(res.data.fallback).toBe(true);
  });
});
