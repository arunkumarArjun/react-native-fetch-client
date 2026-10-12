import { describe, it, expect, vi } from 'vitest';
import {
  CircuitBreaker,
  createClient,
  CircuitBreakerError,
  isCircuitBreakerError,
  NetworkError,
} from '../src/index.js';

describe('Circuit Breaker', () => {
  it('starts in CLOSED state and trips to OPEN after consecutive failures', () => {
    const cb = new CircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      resetTimeoutMs: 100,
    });

    expect(cb.getState()).toBe('CLOSED');

    cb.recordFailure(new NetworkError('failed 1'));
    expect(cb.getState()).toBe('CLOSED');

    cb.recordFailure(new NetworkError('failed 2'));
    expect(cb.getState()).toBe('CLOSED');

    cb.recordFailure(new NetworkError('failed 3'));
    expect(cb.getState()).toBe('OPEN');

    // Trying to execute when OPEN throws CircuitBreakerError immediately
    expect(() => cb.beforeExecution()).toThrow(CircuitBreakerError);

    try {
      cb.beforeExecution();
    } catch (err) {
      expect(isCircuitBreakerError(err)).toBe(true);
      if (isCircuitBreakerError(err)) {
        expect(err.code).toBe('CIRCUIT_OPEN');
        expect(err.state).toBe('OPEN');
        expect(err.resetTimeoutMs).toBe(100);
      }
    }
  });

  it('transitions from OPEN to HALF_OPEN after resetTimeoutMs elapses', async () => {
    const cb = new CircuitBreaker({
      enabled: true,
      failureThreshold: 2,
      resetTimeoutMs: 20,
    });

    cb.recordFailure(new NetworkError('err 1'));
    cb.recordFailure(new NetworkError('err 2'));
    expect(cb.getState()).toBe('OPEN');

    // Wait 25ms for resetTimeoutMs to pass
    await new Promise((r) => setTimeout(r, 25));
    expect(cb.getState()).toBe('HALF_OPEN');

    // Canary success resets circuit back to CLOSED
    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getFailures()).toBe(0);
  });

  it('canary failure in HALF_OPEN immediately trips back to OPEN', async () => {
    const cb = new CircuitBreaker({
      enabled: true,
      failureThreshold: 2,
      resetTimeoutMs: 20,
    });

    cb.recordFailure(new NetworkError('err 1'));
    cb.recordFailure(new NetworkError('err 2'));
    expect(cb.getState()).toBe('OPEN');

    await new Promise((r) => setTimeout(r, 25));
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.recordFailure(new NetworkError('canary failed'));
    expect(cb.getState()).toBe('OPEN');
  });

  it('does not count 4xx client errors as circuit breaker failures', async () => {
    let attempts = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      attempts++;
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'User Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({
      fetchImpl: mockFetch,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
      },
    });

    // Send 5 consecutive 404s
    for (let i = 0; i < 5; i++) {
      await expect(client.get('https://api.test/missing')).rejects.toThrow();
    }

    // 404s should NOT trip the circuit breaker
    expect(attempts).toBe(5);
  });
});
