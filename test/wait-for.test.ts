import { describe, it, expect, vi } from 'vitest';
import {
  createClient,
  WaitForAbortedError,
  isWaitForAbortedError,
  TimeoutError,
  CancelError,
  HttpError,
} from '../src/index.js';
import { createMockAdapter } from '../src/mock.js';

describe('api.waitFor() - Intelligent Webhook & Async Poller', () => {
  it('waits until predicate matches and returns HttpResponse', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    mock.onGet('/orders/123/status').reply((): [number, unknown] => {
      attempts++;
      if (attempts < 3) {
        return [200, { status: 'processing', progress: attempts * 30 }];
      }
      return [200, { status: 'succeeded', transactionId: 'tx_999' }];
    });

    const result = await api.waitFor<{ status: string; transactionId?: string }>(
      '/orders/123/status',
      {
        interval: 10,
        until: (res) => res.data.status === 'succeeded',
      },
    );

    expect(result.status).toBe(200);
    expect(result.data.status).toBe('succeeded');
    expect(result.data.transactionId).toBe('tx_999');
    expect(attempts).toBe(3);
  });

  it('aborts immediately when stopIf matches, throwing WaitForAbortedError with response', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    mock.onGet('/payments/pay_abc').reply((): [number, unknown] => {
      attempts++;
      if (attempts === 1) {
        return [200, { status: 'pending' }];
      }
      return [200, { status: 'failed', failureReason: 'insufficient_funds' }];
    });

    let caughtError: unknown;
    try {
      await api.waitFor<{ status: string; failureReason?: string }>('/payments/pay_abc', {
        interval: 10,
        until: (res) => res.data.status === 'succeeded',
        stopIf: (res) => res.data.status === 'failed',
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(WaitForAbortedError);
    expect(isWaitForAbortedError(caughtError)).toBe(true);

    const abortedErr = caughtError as WaitForAbortedError<{ status: string; failureReason: string }>;
    expect(abortedErr.response.data.status).toBe('failed');
    expect(abortedErr.response.data.failureReason).toBe('insufficient_funds');
    expect(abortedErr.code).toBe('WAIT_FOR_ABORTED');
    expect(attempts).toBe(2);
  });

  it('tolerates initial 404 responses when ignoreErrors includes 404', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    mock.onGet('/webhook/events/evt_1').reply((): [number, unknown] => {
      attempts++;
      if (attempts <= 2) {
        // Record not inserted yet by worker
        return [404, { error: 'Not Found' }];
      }
      return [200, { id: 'evt_1', status: 'settled' }];
    });

    const res = await api.waitFor<{ id: string; status: string }>('/webhook/events/evt_1', {
      interval: 10,
      ignoreErrors: [404],
      until: (r) => r.data.status === 'settled',
    });

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('settled');
    expect(attempts).toBe(3);
  });

  it('throws immediately on non-ignored HTTP errors', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    mock.onGet('/orders/err').reply(500, { error: 'Internal Server Error' });

    await expect(
      api.waitFor('/orders/err', {
        interval: 10,
        ignoreErrors: [404], // 500 is NOT ignored
        until: () => true,
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('caps interval using maxInterval when backoff is applied', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    const timestamps: number[] = [];

    mock.onGet('/exponential-check').reply((): [number, unknown] => {
      attempts++;
      timestamps.push(Date.now());
      if (attempts < 4) {
        return [200, { done: false }];
      }
      return [200, { done: true }];
    });

    const res = await api.waitFor<{ done: boolean }>('/exponential-check', {
      interval: 10,
      backoff: 3,
      maxInterval: 25, // caps exponential growth at 25ms
      until: (r) => r.data.done,
    });

    expect(res.data.done).toBe(true);
    expect(attempts).toBe(4);
  });

  it('fires onTick callback on every iteration with attempt count and response', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    mock.onGet('/tick-test').reply((): [number, unknown] => {
      attempts++;
      return [200, { step: attempts }];
    });

    const ticks: Array<{ attempt: number; elapsedMs: number; step?: number | undefined }> = [];

    await api.waitFor<{ step: number }>('/tick-test', {
      interval: 10,
      until: (res) => res.data.step === 3,
      onTick: ({ attempt, elapsedMs, response }) => {
        ticks.push({ attempt, elapsedMs, step: response?.data?.step });
      },
    });

    expect(ticks.length).toBe(3);
    expect(ticks[0]?.attempt).toBe(1);
    expect(ticks[0]?.step).toBe(1);
    expect(ticks[1]?.attempt).toBe(2);
    expect(ticks[1]?.step).toBe(2);
    expect(ticks[2]?.attempt).toBe(3);
    expect(ticks[2]?.step).toBe(3);
  });

  it('cancels immediately when AbortSignal triggers', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    mock.onGet('/cancel-test').reply(200, { ready: false });

    const controller = new AbortController();

    setTimeout(() => {
      controller.abort();
    }, 25);

    await expect(
      api.waitFor('/cancel-test', {
        interval: 15,
        until: () => false,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(CancelError);
  });

  it('throws TimeoutError when timeout expires', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    mock.onGet('/timeout-test').reply(200, { ready: false });

    await expect(
      api.waitFor('/timeout-test', {
        interval: 15,
        timeout: 40,
        until: () => false,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('throws TimeoutError when maxAttempts is reached', async () => {
    const api = createClient({ baseURL: 'https://api.test' });
    const mock = createMockAdapter(api);

    let attempts = 0;
    mock.onGet('/attempts-test').reply((): [number, unknown] => {
      attempts++;
      return [200, { ready: false }];
    });

    await expect(
      api.waitFor('/attempts-test', {
        interval: 10,
        maxAttempts: 3,
        until: () => false,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);

    expect(attempts).toBe(3);
  });
});
