import { describe, it, expect, vi } from 'vitest';
import {
  createClient,
  createMockAdapter,
  TimeoutError,
  CancelError,
} from '../src/index.js';

describe('Regression Tests: Bug 1 - Binary Upload byteOffset & byteLength', () => {
  it('respects byteOffset and byteLength for Uint8Array subarray', async () => {
    let capturedBlob: Blob | null = null;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      const fd = init?.body as FormData;
      capturedBlob = fd.get('file') as Blob;
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });

    const full = new Uint8Array([10, 20, 30, 40, 50]);
    const partial = full.subarray(1, 3); // expected bytes: [20, 30]

    await client.upload('https://api.test/upload', partial);

    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.size).toBe(2);
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([20, 30]);
  });

  it('handles full Uint8Array correctly', async () => {
    let capturedBlob: Blob | null = null;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      const fd = init?.body as FormData;
      capturedBlob = fd.get('file') as Blob;
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const full = new Uint8Array([1, 2, 3, 4]);

    await client.upload('https://api.test/upload', full);

    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.size).toBe(4);
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('handles empty typed array correctly without error', async () => {
    let capturedBlob: Blob | null = null;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      const fd = init?.body as FormData;
      capturedBlob = fd.get('file') as Blob;
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const empty = new Uint8Array(0);

    await client.upload('https://api.test/upload', empty);

    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.size).toBe(0);
  });

  it('handles DataView backed by portion of larger buffer', async () => {
    let capturedBlob: Blob | null = null;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      const fd = init?.body as FormData;
      capturedBlob = fd.get('file') as Blob;
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const buffer = new ArrayBuffer(16);
    const u8 = new Uint8Array(buffer);
    u8.set([0, 0, 100, 101, 102, 0, 0, 0]);

    // DataView selecting offset 2, length 3 -> [100, 101, 102]
    const dataView = new DataView(buffer, 2, 3);

    await client.upload('https://api.test/upload', dataView);

    expect(capturedBlob).not.toBeNull();
    expect(capturedBlob!.size).toBe(3);
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([100, 101, 102]);
  });

  it('preserves existing Blob and File upload behavior', async () => {
    let capturedBlob: Blob | null = null;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      const fd = init?.body as FormData;
      capturedBlob = fd.get('document') as Blob;
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const originalBlob = new Blob(['hello world'], { type: 'text/plain' });

    await client.upload('https://api.test/upload', originalBlob, {
      fieldName: 'document',
      fileName: 'hello.txt',
    });

    expect(capturedBlob).not.toBeNull();
    expect(await capturedBlob!.text()).toBe('hello world');
  });
});

describe('Regression Tests: Bug 2 & Bug 3 - Polling Timeout & Immediate Cancellation', () => {
  it('aborts a hanging in-flight request when overall polling deadline expires', async () => {
    let wasAborted = false;
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          wasAborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const client = createClient({ fetchImpl: mockFetch });
    const start = Date.now();

    await expect(
      client.poll('https://api.test/hang', {
        interval: 100,
        timeout: 80,
        until: () => true,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);

    const elapsed = Date.now() - start;
    expect(wasAborted).toBe(true);
    expect(elapsed).toBeLessThan(350);
  });

  it('resolves successfully when request completes before deadline', async () => {
    let count = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      count++;
      return Promise.resolve(
        new Response(JSON.stringify({ status: count >= 2 ? 'DONE' : 'PENDING' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });
    const res = await client.poll<{ status: string }>('https://api.test/poll', {
      interval: 50,
      timeout: 1000,
      until: (r) => r.data.status === 'DONE',
    });

    expect(res.data.status).toBe('DONE');
    expect(count).toBe(2);
  });

  it('throws TimeoutError when timeout occurs during interval delay', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ status: 'PENDING' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });
    const start = Date.now();

    await expect(
      client.poll('https://api.test/poll', {
        interval: 500,
        timeout: 80,
        until: () => false,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(350);
  });

  it('rejects immediately with CancelError if caller signal is already aborted before polling', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted'));

    const mockFetch = vi.fn();
    const client = createClient({ fetchImpl: mockFetch });

    await expect(
      client.poll('https://api.test/poll', {
        signal: controller.signal,
        until: () => true,
      }),
    ).rejects.toBeInstanceOf(CancelError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('aborts promptly when caller aborts while a request is in flight', async () => {
    const controller = new AbortController();
    const mockFetch = vi.fn().mockImplementation((_req: Request, init?: RequestInit) => {
      setTimeout(() => controller.abort(new Error('User cancelled during request')), 20);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const client = createClient({ fetchImpl: mockFetch });

    await expect(
      client.poll('https://api.test/poll', {
        signal: controller.signal,
        timeout: 5000,
        until: () => true,
      }),
    ).rejects.toBeInstanceOf(CancelError);
  });

  it('immediately interrupts long delay when caller aborts and prevents next request', async () => {
    const controller = new AbortController();
    let pollCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      pollCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ status: 'PENDING' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });

    // Abort after 30ms, while sleeping in a 3000ms interval
    setTimeout(() => controller.abort(), 30);
    const start = Date.now();

    await expect(
      client.poll('https://api.test/poll', {
        interval: 3000,
        timeout: 10000,
        signal: controller.signal,
        until: () => false,
      }),
    ).rejects.toBeInstanceOf(CancelError);

    const elapsed = Date.now() - start;
    // Must be cancelled promptly, not after 3000ms
    expect(elapsed).toBeLessThan(300);
    // Did not issue a second polling request
    expect(pollCount).toBe(1);
  });
});

describe('Regression Tests: Bug 4 - Cancellation Groups Scoped to Client Instance', () => {
  it('two requests using the same group within one client: earlier request is cancelled', async () => {
    const client = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(client);

    mock.onGet('/search?q=1').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 60));
      return [200, { data: 1 }];
    });
    mock.onGet('/search?q=2').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 10));
      return [200, { data: 2 }];
    });

    const p1 = client.get('/search?q=1', { cancelPrevious: 'search-group' });
    const p2 = client.get('/search?q=2', { cancelPrevious: 'search-group' });

    await expect(p1).rejects.toBeInstanceOf(CancelError);
    const res2 = await p2;
    expect(res2.data).toEqual({ data: 2 });
  });

  it('two separate clients using the same group name: neither cancels the other', async () => {
    const clientA = createClient({ baseURL: 'https://api.example.com' });
    const clientB = createClient({ baseURL: 'https://api.example.com' });

    const mockA = createMockAdapter(clientA);
    const mockB = createMockAdapter(clientB);

    mockA.onGet('/resource').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 40));
      return [200, { client: 'A' }];
    });
    mockB.onGet('/resource').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 40));
      return [200, { client: 'B' }];
    });

    // Both dispatch concurrently with the exact same cancelPrevious group name
    const [resA, resB] = await Promise.all([
      clientA.get('/resource', { cancelPrevious: 'autocomplete' }),
      clientB.get('/resource', { cancelPrevious: 'autocomplete' }),
    ]);

    expect(resA.data).toEqual({ client: 'A' });
    expect(resB.data).toEqual({ client: 'B' });
  });

  it('two clients sharing a base URL but separate instances do not collide', async () => {
    const clientA = createClient({ baseURL: 'https://shared-api.com' });
    const clientB = createClient({ baseURL: 'https://shared-api.com' });

    const mockA = createMockAdapter(clientA);
    const mockB = createMockAdapter(clientB);

    mockA.onGet('/users').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 30));
      return [200, [{ id: 1 }]];
    });
    mockB.onGet('/users').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 30));
      return [200, [{ id: 2 }]];
    });

    const [resA, resB] = await Promise.all([
      clientA.get('/users', { cancelPrevious: 'list-users' }),
      clientB.get('/users', { cancelPrevious: 'list-users' }),
    ]);

    expect(resA.data).toEqual([{ id: 1 }]);
    expect(resB.data).toEqual([{ id: 2 }]);
  });

  it('cancellation followed by a new request using the same group succeeds', async () => {
    const client = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(client);

    mock.onGet('/item/1').reply(200, { id: 1 });
    mock.onGet('/item/2').reply(200, { id: 2 });

    const r1 = await client.get('/item/1', { cancelPrevious: 'item-view' });
    expect(r1.status).toBe(200);
    expect(r1.data).toEqual({ id: 1 });

    const r2 = await client.get('/item/2', { cancelPrevious: 'item-view' });
    expect(r2.status).toBe(200);
    expect(r2.data).toEqual({ id: 2 });
  });

  it('handles completion and cleanup occurring out of order without corrupting group state', async () => {
    const client = createClient({ baseURL: 'https://api.example.com' });
    const mock = createMockAdapter(client);

    mock.onGet('/slow').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 80));
      return [200, { slow: true }];
    });
    mock.onGet('/fast').reply(async (): Promise<[number, unknown]> => {
      await new Promise((r) => setTimeout(r, 10));
      return [200, { fast: true }];
    });

    const pSlow = client.get('/slow', { cancelPrevious: 'dynamic-group' });
    const pFast = client.get('/fast', { cancelPrevious: 'dynamic-group' });

    await expect(pSlow).rejects.toBeInstanceOf(CancelError);
    const resFast = await pFast;
    expect(resFast.data).toEqual({ fast: true });

    // Subsequent request in same group still functions normally
    mock.onGet('/next').reply(200, { next: true });
    const resNext = await client.get('/next', { cancelPrevious: 'dynamic-group' });
    expect(resNext.data).toEqual({ next: true });
  });
});
