import type { OfflineStorageAdapter } from './types.js';

/**
 * Universal in-memory storage adapter for environments without persistent storage
 * or for isolated unit testing.
 */
export class MemoryStorageAdapter implements OfflineStorageAdapter {
  private readonly store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }
}
