import type {
  Interceptor,
  InterceptorFulfilled,
  InterceptorManager,
  InterceptorRejected,
} from './types.js';

interface InterceptorEntry<V> {
  id: number;
  interceptor: Interceptor<V>;
}

/**
 * Manages an ordered chain of request or response interceptors.
 */
export class DefaultInterceptorManager<V> implements InterceptorManager<V> {
  private handlers: Array<InterceptorEntry<V> | null> = [];
  private nextId = 0;

  /**
   * Register a new interceptor.
   * @returns Numeric registration ID used to eject.
   */
  public use(fulfilled: InterceptorFulfilled<V>, rejected?: InterceptorRejected): number {
    const id = this.nextId++;
    const entry: InterceptorEntry<V> = {
      id,
      interceptor: {
        fulfilled,
      },
    };
    if (rejected !== undefined) {
      entry.interceptor.rejected = rejected;
    }
    this.handlers.push(entry);
    return id;
  }

  /**
   * Remove a registered interceptor by ID.
   */
  public eject(id: number): void {
    const index = this.handlers.findIndex((h) => h !== null && h.id === id);
    if (index !== -1) {
      this.handlers[index] = null;
    }
  }

  /**
   * Remove all registered interceptors.
   */
  public clear(): void {
    this.handlers = [];
  }

  /**
   * Returns active interceptors in registration order.
   */
  public getInterceptors(): Array<Interceptor<V>> {
    const active: Array<Interceptor<V>> = [];
    for (const h of this.handlers) {
      if (h !== null) {
        active.push(h.interceptor);
      }
    }
    return active;
  }
}
