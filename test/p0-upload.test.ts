import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import type { ProgressEvent } from '../src/types.js';

describe('P0 Upload Progress Reporting Tests', () => {
  it('does NOT report 100% before network fetch begins; reports 0% at start and 100% upon completion', async () => {
    const progressEvents: ProgressEvent[] = [];
    let fetchCalled = false;

    const mockFetch = vi.fn().mockImplementation(async () => {
      fetchCalled = true;
      // At the point fetch starts, we should NOT have received progress: 1
      expect(progressEvents.some((e) => e.progress === 1)).toBe(false);
      // We should have received progress: 0
      expect(progressEvents.some((e) => e.progress === 0)).toBe(true);

      await new Promise((r) => setTimeout(r, 20));

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const testBody = JSON.stringify({ message: 'hello world', payload: [1, 2, 3] });

    await client.post('/upload', testBody, {
      onUploadProgress: (evt) => {
        progressEvents.push({ ...evt });
      },
    });

    expect(fetchCalled).toBe(true);
    expect(progressEvents.length).toBe(2);
    expect(progressEvents[0]?.progress).toBe(0);
    expect(progressEvents[0]?.loaded).toBe(0);
    expect(progressEvents[0]?.total).toBe(new TextEncoder().encode(testBody).length);

    expect(progressEvents[1]?.progress).toBe(1);
    expect(progressEvents[1]?.loaded).toBe(progressEvents[1]?.total);
    expect(progressEvents[1]?.loaded).toBe(new TextEncoder().encode(testBody).length);
  });

  it('never emits 100% progress if the network request fails', async () => {
    const progressEvents: ProgressEvent[] = [];

    const mockFetch = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('Network error during upload');
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
      retry: { attempts: 0 },
    });

    const testBody = 'important file payload';

    await expect(
      client.post('/upload', testBody, {
        onUploadProgress: (evt) => {
          progressEvents.push({ ...evt });
        },
      }),
    ).rejects.toThrow();

    // 0% was reported at dispatch
    expect(progressEvents.length).toBe(1);
    expect(progressEvents[0]?.progress).toBe(0);
    // 100% was NEVER falsely reported
    expect(progressEvents.some((e) => e.progress === 1)).toBe(false);
  });

  it('never emits 100% progress if caller aborts during upload', async () => {
    const progressEvents: ProgressEvent[] = [];
    const abortCtrl = new AbortController();

    const mockFetch = vi.fn().mockImplementation(async (_req: Request, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const client = createClient({
      baseURL: 'https://api.example.com',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const p = client.post('/upload', 'some data to upload', {
      signal: abortCtrl.signal,
      onUploadProgress: (evt) => {
        progressEvents.push({ ...evt });
      },
    });

    setTimeout(() => {
      abortCtrl.abort();
    }, 15);

    await expect(p).rejects.toThrow();

    // 100% must never have been reported
    expect(progressEvents.some((e) => e.progress === 1)).toBe(false);
  });
});
