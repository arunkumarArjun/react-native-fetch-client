/**
 * Merges multiple HeadersInit sources into a single normalized Record<string, string>.
 * Keys are normalized to lowercase. Later sources override earlier ones.
 * Fast-paths plain objects to avoid expensive native WHATWG Headers instantiation in hot loops.
 */
export function mergeHeaders(...headersList: (HeadersInit | undefined)[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const headers of headersList) {
    if (!headers) continue;

    // Fast path: plain JavaScript object (covers 95%+ of typical requests)
    if (
      typeof headers === 'object' &&
      !Array.isArray(headers) &&
      typeof (headers as Headers).forEach !== 'function'
    ) {
      for (const key of Object.keys(headers)) {
        const val = (headers as Record<string, unknown>)[key];
        if (typeof val === 'string') {
          merged[key.toLowerCase()] = val;
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          merged[key.toLowerCase()] = String(val);
        }
      }
      continue;
    }

    // Headers instance with forEach
    if (typeof (headers as Headers).forEach === 'function') {
      (headers as Headers).forEach((value, key) => {
        merged[key.toLowerCase()] = value;
      });
      continue;
    }

    // Array of key-value tuples: [['Accept', 'application/json']]
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (key && value !== undefined && value !== null) {
          merged[key.toLowerCase()] = String(value);
        }
      }
      continue;
    }

    // Universal fallback
    try {
      const h = new Headers(headers);
      h.forEach((value, key) => {
        merged[key.toLowerCase()] = value;
      });
    } catch {
      // Ignore unparseable headers
    }
  }
  return merged;
}
