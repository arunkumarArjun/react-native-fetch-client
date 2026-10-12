import { describe, it, expect, vi } from 'vitest';
import { ConcurrencyLimiter, createClient } from '../src/index.js';

describe('Client Concurrency Throttler', () => {
  it('strictly limits concurrent execution count to maxConcurrent', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let activeTasks = 0;
    let maxSeenActive = 0;

    const runTask = async (durationMs: number) => {
      return limiter.run(async () => {
        activeTasks++;
        maxSeenActive = Math.max(maxSeenActive, activeTasks);
        await new Promise((r) => setTimeout(r, durationMs));
        activeTasks--;
        return 'done';
      });
    };

    const tasks = [runTask(50), runTask(50), runTask(50), runTask(50), runTask(50)];

    const results = await Promise.all(tasks);
    expect(results).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(maxSeenActive).toBe(2);
  });

  it('preserves FIFO ordering when slots become free', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];

    const task = (id: number) =>
      limiter.run(async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, 10));
      });

    await Promise.all([task(1), task(2), task(3), task(4)]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('cancels pending requests via AbortSignal without holding slots', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const controller = new AbortController();

    // Occupy slot 1
    const p1 = limiter.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    });

    // Queue task 2 with abort signal
    const p2 = limiter.run(() => Promise.resolve(2), controller.signal);

    controller.abort(new Error('User cancelled'));

    await expect(p2).rejects.toThrow('User cancelled');
    expect(await p1).toBe(1);
    expect(limiter.active).toBe(0);
  });

  it('integrates with createClient({ maxConcurrentRequests: 2 })', async () => {
    let simultaneous = 0;
    let peak = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      simultaneous++;
      peak = Math.max(peak, simultaneous);
      await new Promise((r) => setTimeout(r, 30));
      simultaneous--;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = createClient({
      fetchImpl: mockFetch,
      maxConcurrentRequests: 2,
    });

    await Promise.all([
      client.get('https://api.test/1'),
      client.get('https://api.test/2'),
      client.get('https://api.test/3'),
      client.get('https://api.test/4'),
    ]);

    expect(peak).toBe(2);
  });
});
