/**
 * Merges multiple HeadersInit sources into a single normalized Record<string, string>.
 * Keys are normalized to lowercase. Later sources override earlier ones.
 */
export function mergeHeaders(...headersList: (HeadersInit | undefined)[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const headers of headersList) {
    if (!headers) continue;
    const h = new Headers(headers);
    h.forEach((value, key) => {
      merged[key.toLowerCase()] = value;
    });
  }
  return merged;
}
