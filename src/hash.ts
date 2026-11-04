/**
 * Shared internal hashing utilities for react-native-fetch-client.
 *
 * @internal
 * @module hash
 */

/**
 * Deterministically hashes a string to an opaque 8-character hex digest using djb2.
 * Used to prevent raw authentication tokens and credentials from leaking into
 * cache keys, dedup keys, debug logs, or unencrypted persistent storage.
 *
 * @internal
 */
export function hashAuthHeader(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
