/**
 * Phase 1 — Foundation tests.
 *
 * Tests the error hierarchy, type guards, and module structure.
 * No HTTP logic is present yet; this phase only validates the
 * error classes, prototype chains, and public surface.
 */

import { describe, it, expect } from 'vitest';
import {
  FetchNativeError,
  HttpError,
  NetworkError,
  TimeoutError,
  CancelError,
  ParseError,
  ConfigError,
  RetryExhaustedError,
  isFetchNativeError,
  isHttpError,
  isNetworkError,
  isTimeoutError,
  isCancelError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// FetchNativeError (base)
// ---------------------------------------------------------------------------

describe('FetchNativeError', () => {
  it('is an instance of Error', () => {
    const err = new FetchNativeError('test', 'NETWORK_ERROR');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchNativeError);
  });

  it('sets name, message, and code', () => {
    const err = new FetchNativeError('something went wrong', 'CONFIG_ERROR');
    expect(err.name).toBe('FetchNativeError');
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('preserves prototype chain so instanceof works after throw/catch', () => {
    let caught: unknown;
    try {
      throw new FetchNativeError('base error', 'NETWORK_ERROR');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FetchNativeError);
    expect(caught).toBeInstanceOf(Error);
  });

  it('stores optional config', () => {
    const config = {
      url: 'https://example.com',
      method: 'GET' as const,
      headers: { authorization: '[REDACTED]' },
      timeout: 5000,
      responseType: 'json' as const,
      retry: {
        attempts: 3,
        backoff: 'exponential' as const,
        delay: 1000,
        maxDelay: 30000,
        jitter: true,
        retryOn: [429, 500],
        safeMethods: ['GET' as const],
        respectRetryAfter: true,
      },
    };
    const err = new FetchNativeError('err', 'HTTP_ERROR', { config });
    expect(err.config).toBe(config);
  });

  it('stores cause when provided', () => {
    const cause = new Error('underlying cause');
    const err = new FetchNativeError('wrapped', 'NETWORK_ERROR', { cause });
    expect(err.cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// HttpError
// ---------------------------------------------------------------------------

describe('HttpError', () => {
  const makeResponse = (status: number): Response =>
    new Response(null, { status, statusText: 'Error' });

  it('is an instance of FetchNativeError and Error', () => {
    const err = new HttpError('Not Found', {
      status: 404,
      statusText: 'Not Found',
      data: null,
      headers: {},
      response: makeResponse(404),
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(HttpError);
  });

  it('is NOT an instance of NetworkError', () => {
    const err = new HttpError('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
      data: null,
      headers: {},
      response: makeResponse(500),
    });
    // Critical: a 500 is a received response, not a network failure
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it('sets code to HTTP_ERROR', () => {
    const err = new HttpError('Bad Request', {
      status: 400,
      statusText: 'Bad Request',
      data: { error: 'invalid' },
      headers: { 'content-type': 'application/json' },
      response: makeResponse(400),
    });
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.name).toBe('HttpError');
    expect(err.status).toBe(400);
    expect(err.statusText).toBe('Bad Request');
    expect(err.data).toEqual({ error: 'invalid' });
    expect(err.headers).toEqual({ 'content-type': 'application/json' });
  });
});

// ---------------------------------------------------------------------------
// NetworkError
// ---------------------------------------------------------------------------

describe('NetworkError', () => {
  it('is an instance of FetchNativeError', () => {
    const err = new NetworkError('connection refused');
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(HttpError);
  });

  it('sets code to NETWORK_ERROR and name to NetworkError', () => {
    const err = new NetworkError('DNS lookup failed');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.name).toBe('NetworkError');
    expect(err.message).toBe('DNS lookup failed');
  });
});

// ---------------------------------------------------------------------------
// TimeoutError
// ---------------------------------------------------------------------------

describe('TimeoutError', () => {
  it('is an instance of FetchNativeError', () => {
    const err = new TimeoutError(5000);
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(TimeoutError);
  });

  it('is NOT an instance of NetworkError', () => {
    const err = new TimeoutError(5000);
    expect(err).not.toBeInstanceOf(NetworkError);
  });

  it('sets code to TIMEOUT and generates message from timeout value', () => {
    const err = new TimeoutError(10_000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('TimeoutError');
    expect(err.timeoutMs).toBe(10_000);
    expect(err.message).toBe('Request timed out after 10000ms');
  });
});

// ---------------------------------------------------------------------------
// CancelError
// ---------------------------------------------------------------------------

describe('CancelError', () => {
  it('is an instance of FetchNativeError but not NetworkError or HttpError', () => {
    const err = new CancelError();
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(HttpError);
  });

  it('sets code to CANCELLED', () => {
    const err = new CancelError();
    expect(err.code).toBe('CANCELLED');
    expect(err.name).toBe('CancelError');
    expect(err.message).toBe('Request was cancelled');
  });
});

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

describe('ParseError', () => {
  it('is an instance of FetchNativeError', () => {
    const err = new ParseError('unexpected token', { status: 200, rawBody: 'not json' });
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(ParseError);
  });

  it('stores status and rawBody', () => {
    const err = new ParseError('parse failed', { status: 200, rawBody: '<!DOCTYPE html>' });
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.status).toBe(200);
    expect(err.rawBody).toBe('<!DOCTYPE html>');
  });

  it('accepts null rawBody when body is not readable', () => {
    const err = new ParseError('empty body', { status: 204, rawBody: null });
    expect(err.rawBody).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConfigError
// ---------------------------------------------------------------------------

describe('ConfigError', () => {
  it('is an instance of FetchNativeError', () => {
    const err = new ConfigError('baseURL is required');
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(ConfigError);
  });

  it('sets code to CONFIG_ERROR', () => {
    const err = new ConfigError('invalid timeout value');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.name).toBe('ConfigError');
  });
});

// ---------------------------------------------------------------------------
// RetryExhaustedError
// ---------------------------------------------------------------------------

describe('RetryExhaustedError', () => {
  it('is an instance of FetchNativeError', () => {
    const last = new NetworkError('connection refused');
    const err = new RetryExhaustedError(3, last);
    expect(err).toBeInstanceOf(FetchNativeError);
    expect(err).toBeInstanceOf(RetryExhaustedError);
  });

  it('reports attempt count in message', () => {
    const err = new RetryExhaustedError(3, new NetworkError('fail'));
    expect(err.message).toBe('Request failed after 3 attempts');
    expect(err.attempts).toBe(3);
    expect(err.code).toBe('RETRY_EXHAUSTED');
  });

  it('uses singular "attempt" when count is 1', () => {
    const err = new RetryExhaustedError(1, new NetworkError('fail'));
    expect(err.message).toBe('Request failed after 1 attempt');
  });

  it('exposes lastError and sets cause on the Error object', () => {
    const last = new NetworkError('final failure');
    const err = new RetryExhaustedError(3, last);
    expect(err.lastError).toBe(last);
    expect(err.cause).toBe(last);
  });

  it('handles non-Error lastError gracefully', () => {
    const err = new RetryExhaustedError(2, 'string error');
    expect(err.lastError).toBe('string error');
    expect(err.cause).toBeUndefined(); // cause only set when lastError is an Error
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('Type guards', () => {
  it('isFetchNativeError identifies any library error', () => {
    expect(isFetchNativeError(new FetchNativeError('x', 'NETWORK_ERROR'))).toBe(true);
    expect(
      isFetchNativeError(
        new HttpError('x', {
          status: 500,
          statusText: 'ISE',
          data: null,
          headers: {},
          response: new Response(null, { status: 500 }),
        }),
      ),
    ).toBe(true);
    expect(isFetchNativeError(new NetworkError('x'))).toBe(true);
    expect(isFetchNativeError(new Error('plain error'))).toBe(false);
    expect(isFetchNativeError(null)).toBe(false);
    expect(isFetchNativeError('string')).toBe(false);
  });

  it('isHttpError only matches HttpError', () => {
    expect(
      isHttpError(
        new HttpError('x', {
          status: 404,
          statusText: 'NF',
          data: null,
          headers: {},
          response: new Response(null, { status: 404 }),
        }),
      ),
    ).toBe(true);
    expect(isHttpError(new NetworkError('x'))).toBe(false);
    expect(isHttpError(new TimeoutError(1000))).toBe(false);
  });

  it('isNetworkError only matches NetworkError', () => {
    expect(isNetworkError(new NetworkError('x'))).toBe(true);
    expect(
      isNetworkError(
        new HttpError('x', {
          status: 500,
          statusText: 'ISE',
          data: null,
          headers: {},
          response: new Response(null, { status: 500 }),
        }),
      ),
    ).toBe(false);
  });

  it('isTimeoutError only matches TimeoutError', () => {
    expect(isTimeoutError(new TimeoutError(5000))).toBe(true);
    expect(isTimeoutError(new NetworkError('x'))).toBe(false);
    expect(isTimeoutError(new CancelError())).toBe(false);
  });

  it('isCancelError only matches CancelError', () => {
    expect(isCancelError(new CancelError())).toBe(true);
    expect(isCancelError(new TimeoutError(1000))).toBe(false);
    expect(isCancelError(new NetworkError('x'))).toBe(false);
  });
});
