/**
 * Concurrency Limiter for Fetch-Native-Client.
 *
 * Implements an in-memory FIFO queue to cap the maximum number of simultaneous
 * in-flight HTTP requests dispatched by the client.
 *
 * Prevents socket exhaustion in Node.js, respects mobile browser connection limits
 * (typically 6 per domain on HTTP/1.1), and prevents overwhelming backend microservices.
 *
 * @module concurrency
 */

/**
 * Queue item tracking a pending execution slot.
 */
interface QueueItem {
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * Manages request concurrency with strict FIFO ordering.
 */
export class ConcurrencyLimiter {
  private activeCount = 0;
  private readonly queue: QueueItem[] = [];

  /**
   * @param maxConcurrent Maximum number of concurrent tasks allowed to run simultaneously.
   * If less than or equal to 0, concurrency is unlimited.
   */
  constructor(public readonly maxConcurrent: number) {}

  /**
   * Acquires a concurrency slot. Resolves immediately if active count < limit,
   * otherwise blocks until a preceding task releases a slot.
   */
  private async acquire(signal?: AbortSignal): Promise<void> {
    if (this.maxConcurrent <= 0 || this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const toError = (e: unknown, fallback: string): Error => {
        if (e instanceof Error) return e;
        return new Error(typeof e === 'string' ? e : fallback);
      };

      let onAbort: (() => void) | undefined;

      const item: QueueItem = {
        resolve: () => {
          if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort);
          }
          this.activeCount++;
          resolve();
        },
        reject: (err) => {
          if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort);
          }
          reject(toError(err, 'Concurrency task failed'));
        },
      };

      if (signal) {
        if (signal.aborted) {
          reject(toError(signal.reason, 'Request was aborted while queued'));
          return;
        }

        onAbort = () => {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
          }
          reject(toError(signal.reason, 'Request was aborted while queued'));
        };

        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push(item);
    });
  }

  /**
   * Releases an active concurrency slot and unblocks the next queued task in FIFO order.
   */
  private release(): void {
    this.activeCount--;
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  /**
   * Schedules an asynchronous function through the concurrency limiter.
   *
   * @template T The return type of the function.
   * @param task Function returning a Promise to execute once a slot is available.
   * @param signal Optional AbortSignal to cancel waiting in the queue.
   * @returns The resolved value of the task.
   */
  public async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.maxConcurrent <= 0) {
      return task();
    }

    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  /**
   * Current number of actively executing requests.
   */
  public get active(): number {
    return this.activeCount;
  }

  /**
   * Current number of requests queued waiting for an available slot.
   */
  public get pending(): number {
    return this.queue.length;
  }

  /**
   * Clears all queued pending requests and rejects them with the provided error.
   */
  public clear(error = new Error('Concurrency queue was cancelled')): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject(error);
    }
  }
}
