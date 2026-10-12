import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOfflineQueue, createClient } from '../src/index.js';

describe('Offline Queue Auto-Online Sync', () => {
  let listeners: Record<string, () => void> = {};

  beforeEach(() => {
    listeners = {};
    // Mock global window object with addEventListener / removeEventListener
    vi.stubGlobal('window', {
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = fn;
      },
      removeEventListener: (event: string) => {
        delete listeners[event];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers online event listener when autoSyncOnOnline is enabled', async () => {
    let requestsReplayed = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      requestsReplayed++;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });
    const queue = createOfflineQueue({
      client,
      autoSyncOnOnline: true,
    });

    // Enqueue a mutation while offline
    await queue.enqueue({
      url: 'https://api.test/posts',
      method: 'POST',
      body: { title: 'Offline Note' },
    });

    expect(await queue.size()).toBe(1);
    expect(listeners['online']).toBeDefined();

    // Simulate device coming back online
    listeners['online']!();

    // Give microtask loop time to process replay
    await new Promise((r) => setTimeout(r, 20));

    expect(requestsReplayed).toBe(1);
    expect(await queue.size()).toBe(0);

    // Calling destroy removes the online listener
    queue.destroy();
    expect(listeners['online']).toBeUndefined();
  });
});
