import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient, isDevToolsHidden, withDevToolsSuppression } from '../src/index.js';

describe('Universal DevTools Stealth Mode (isDevToolsHidden)', () => {
  it('returns false when filter is false, undefined, or empty', () => {
    expect(isDevToolsHidden('https://api.test/users')).toBe(false);
    expect(isDevToolsHidden('https://api.test/users', false)).toBe(false);
    expect(isDevToolsHidden('https://api.test/users', [])).toBe(false);
  });

  it('returns true for any URL when filter is true', () => {
    expect(isDevToolsHidden('https://api.test/users', true)).toBe(true);
    expect(isDevToolsHidden('/auth/login', true)).toBe(true);
    expect(isDevToolsHidden('', true)).toBe(true);
  });

  it('matches URLs against string array patterns', () => {
    const filter = ['/auth', '/payment', 'token'];

    expect(isDevToolsHidden('https://api.test/auth/login', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/payment/process', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/v1/refresh-token', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/public/items', filter)).toBe(false);
  });

  it('matches URLs against RegExp patterns', () => {
    const filter = [/^\/v1\/secure/, /admin/i];

    expect(isDevToolsHidden('/v1/secure/keys', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/api/ADMIN/settings', filter)).toBe(true);
    expect(isDevToolsHidden('/v2/secure/keys', filter)).toBe(false);
    expect(isDevToolsHidden('https://api.test/users', filter)).toBe(false);
  });

  it('supports mixed array of strings and RegExps', () => {
    const filter = ['/private', /card-\d+/];

    expect(isDevToolsHidden('https://api.test/private/data', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/vault/card-1234', filter)).toBe(true);
    expect(isDevToolsHidden('https://api.test/vault/card-abcd', filter)).toBe(false);
  });
});

describe('Stealth Mode Client Integration', () => {
  it('sets hideFromDevTools flag on resolvedConfig when client-level option is true', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ secret: 'data' }), { status: 200 }));

    const client = createClient({
      baseURL: 'https://api.test',
      fetchImpl: mockFetch,
      hideFromDevTools: true,
    });

    const res = await client.get('/secret');
    expect(res.status).toBe(200);
    expect(res.config.hideFromDevTools).toBe(true);
  });

  it('suppresses debug logging when request matches hideFromDevTools', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      );

    const debugLogger = vi.fn();
    const client = createClient({
      baseURL: 'https://api.test',
      fetchImpl: mockFetch,
      debug: debugLogger,
      hideFromDevTools: ['/auth'],
    });

    // 1. Hidden request: debug logger should NOT be called
    await client.get('/auth');
    expect(debugLogger).not.toHaveBeenCalled();

    // 2. Non-hidden request: debug logger should be called
    await client.get('/public');
    expect(debugLogger).toHaveBeenCalledTimes(1);
    const firstCallArgs = debugLogger.mock.calls[0] as [{ url: string }];
    expect(firstCallArgs[0]?.url).toContain('/public');
  });

  it('allows request-level override of hideFromDevTools', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const debugLogger = vi.fn();
    const client = createClient({
      baseURL: 'https://api.test',
      fetchImpl: mockFetch,
      debug: debugLogger,
      hideFromDevTools: false, // client default false
    });

    // Request overrides to true
    const res = await client.get('/data', { hideFromDevTools: true });
    expect(res.config.hideFromDevTools).toBe(true);
    expect(debugLogger).not.toHaveBeenCalled();
  });

  it('preserves hideFromDevTools flag on error objects', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 }),
      );

    const debugLogger = vi.fn();
    const client = createClient({
      baseURL: 'https://api.test',
      fetchImpl: mockFetch,
      debug: debugLogger,
      hideFromDevTools: true,
    });

    const [data, err] = await client.safe.get('/fail');
    expect(data).toBeNull();
    expect(err).not.toBeNull();
    expect(err?.config?.hideFromDevTools).toBe(true);
    expect(debugLogger).not.toHaveBeenCalled();
  });
});

interface MockXHR {
  _url?: string;
}

type MockSendCallback = (data: unknown, xhr: MockXHR) => void;
type MockResponseCallback = (
  status: number,
  timeout: number,
  response: unknown,
  url?: string,
) => void;

interface MockInterceptor {
  isInterceptorEnabled: () => boolean;
  setSendCallback: (cb: MockSendCallback) => void;
  setResponseCallback: (cb: MockResponseCallback) => void;
  _sendCallback?: MockSendCallback;
  _responseCallback?: MockResponseCallback;
}

interface TestGlobalScope {
  __REACT_NATIVE_XHR_INTERCEPTOR__?: MockInterceptor;
}

describe('React Native XHRInterceptor Suppression Simulation', () => {
  let mockInterceptor: MockInterceptor;

  beforeEach(() => {
    mockInterceptor = {
      isInterceptorEnabled: vi.fn(() => true),
      setSendCallback: vi.fn((cb: MockSendCallback) => {
        mockInterceptor._sendCallback = cb;
      }),
      setResponseCallback: vi.fn((cb: MockResponseCallback) => {
        mockInterceptor._responseCallback = cb;
      }),
    };

    (globalThis as unknown as TestGlobalScope).__REACT_NATIVE_XHR_INTERCEPTOR__ = mockInterceptor;
  });

  afterEach(() => {
    delete (globalThis as unknown as TestGlobalScope).__REACT_NATIVE_XHR_INTERCEPTOR__;
  });

  it('mutes send callback for matching hidden URL and restores original after execution', async () => {
    const originalCallback = vi.fn();
    mockInterceptor._sendCallback = originalCallback;

    const url = 'https://api.test/secure-payment';
    let sendCallbackDuringExecution: MockSendCallback | undefined;

    await withDevToolsSuppression(url, true, async () => {
      // Capture the callback installed by withDevToolsSuppression
      sendCallbackDuringExecution = mockInterceptor._sendCallback;

      // Simulate DevTools trying to record the hidden request
      const fakeXhr: MockXHR = { _url: url };
      if (sendCallbackDuringExecution) {
        sendCallbackDuringExecution('payload', fakeXhr);
      }

      // The original callback should NOT have been invoked because it matched!
      expect(originalCallback).not.toHaveBeenCalled();

      // Simulate a non-hidden request passing through
      const publicXhr: MockXHR = { _url: 'https://api.test/public' };
      if (sendCallbackDuringExecution) {
        sendCallbackDuringExecution('public-payload', publicXhr);
      }
      expect(originalCallback).toHaveBeenCalledWith('public-payload', publicXhr);

      await Promise.resolve();
      return 'success';
    });

    // After withDevToolsSuppression finishes, original callback is restored
    expect(mockInterceptor.setSendCallback).toHaveBeenCalledWith(originalCallback);
  });

  it('mutes response callback for matching hidden URL and restores original after execution', async () => {
    const originalResponseCallback = vi.fn();
    mockInterceptor._responseCallback = originalResponseCallback;

    const url = 'https://api.test/secure-payment';
    let responseCallbackDuringExecution: MockResponseCallback | undefined;

    await withDevToolsSuppression(url, true, async () => {
      responseCallbackDuringExecution = mockInterceptor._responseCallback;

      // Simulate DevTools trying to record response of the hidden request
      if (responseCallbackDuringExecution) {
        responseCallbackDuringExecution(200, 0, { token: 'secret' }, url);
      }

      // The original response callback should NOT have been invoked because URL matched!
      expect(originalResponseCallback).not.toHaveBeenCalled();

      // Simulate a non-hidden response passing through
      if (responseCallbackDuringExecution) {
        responseCallbackDuringExecution(200, 0, { data: 'public' }, 'https://api.test/public');
      }
      expect(originalResponseCallback).toHaveBeenCalledWith(
        200,
        0,
        { data: 'public' },
        'https://api.test/public',
      );

      await Promise.resolve();
      return 'success';
    });

    // After withDevToolsSuppression finishes, original response callback is restored
    expect(mockInterceptor.setResponseCallback).toHaveBeenCalledWith(originalResponseCallback);
  });
});
