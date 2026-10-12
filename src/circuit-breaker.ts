/**
 * Circuit Breaker State Machine for Fetch-Native-Client.
 *
 * Implements the classic Release It! Circuit Breaker pattern with three states:
 *
 *         [Consecutive failures >= threshold]
 *  CLOSED -------------------------------------> OPEN
 *    ^                                             |
 *    | [Canary succeeded]                          | [resetTimeoutMs elapsed]
 *    |                                             v
 *    +---------------------------------------- HALF_OPEN
 *             [Canary failed: re-open]
 *
 * Purpose:
 * When an upstream microservice crashes or experiences an outage, attempting
 * continuous HTTP requests wastes sockets, drains mobile battery, and thrashes
 * downstream services. The circuit breaker fails fast locally with `CircuitBreakerError`,
 * protecting both client resources and the failing server.
 *
 * @module circuit-breaker
 */

import { CircuitBreakerError, isHttpError, isNetworkError, isTimeoutError } from './errors.js';
import type { CircuitBreakerConfig, CircuitState } from './types.js';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Default predicate determining if an error indicates server failure.
 * Returns true for 5xx server errors, network dropouts, and timeouts.
 * Client errors (4xx like 400, 401, 404) do NOT count as circuit failures.
 */
function defaultIsFailure(err: unknown): boolean {
  if (isNetworkError(err) || isTimeoutError(err)) {
    return true;
  }
  if (isHttpError(err) && err.status >= 500) {
    return true;
  }
  return false;
}

/**
 * Manages the state machine for a circuit breaker instance.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextAttemptTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly isFailureFn: (error: unknown) => boolean;

  constructor(public readonly config: CircuitBreakerConfig) {
    this.failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.resetTimeoutMs = config.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
    this.isFailureFn = config.isFailure ?? defaultIsFailure;
  }

  /**
   * Current lifecycle state of the circuit breaker.
   */
  public getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  /**
   * Current consecutive failure count.
   */
  public getFailures(): number {
    return this.failureCount;
  }

  /**
   * Resets the circuit breaker state to CLOSED and clears failure counts.
   */
  public reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  /**
   * Checks if a request is allowed to execute.
   * Throws `CircuitBreakerError` if the circuit is currently OPEN.
   */
  public beforeExecution(): void {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      const remainingMs = Math.max(0, this.nextAttemptTime - Date.now());
      throw new CircuitBreakerError(
        `Circuit breaker is OPEN. Service is temporarily unavailable (retry in ${Math.round(remainingMs / 1000)}s)`,
        {
          state: 'OPEN',
          resetTimeoutMs: this.resetTimeoutMs,
        },
      );
    }
  }

  /**
   * Records a successful execution. If the circuit was in HALF_OPEN state,
   * it transitions back to CLOSED.
   */
  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  /**
   * Records an execution error. Evaluates the failure predicate and
   * updates the circuit state accordingly.
   */
  public recordFailure(error: unknown): void {
    if (!this.isFailureFn(error)) {
      return;
    }

    const currentState = this.getState();

    if (currentState === 'HALF_OPEN') {
      // Canary failed -> trip right back to OPEN
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
    }
  }

  /**
   * Executes a task wrapped in the circuit breaker lifecycle.
   *
   * @template T Return type of the task.
   * @param task Function returning a Promise to execute.
   * @returns Result of the task.
   * @throws {CircuitBreakerError} If the circuit is OPEN.
   */
  public async execute<T>(task: () => Promise<T>): Promise<T> {
    this.beforeExecution();
    try {
      const result = await task();
      this.recordSuccess();
      return result;
    } catch (err: unknown) {
      this.recordFailure(err);
      throw err;
    }
  }
}
