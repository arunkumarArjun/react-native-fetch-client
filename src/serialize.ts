/**
 * Serializes a request body and determines the appropriate Content-Type.
 */
export function serializeBody(
  body: unknown,
  headers?: Record<string, string>,
  formUrlEncoded?: boolean,
): { body: BodyInit | null; contentType?: string } {
  if (body === null || body === undefined) {
    return { body: null };
  }

  if (typeof body === 'string') {
    return { body, contentType: 'text/plain' };
  }

  // These types are handled natively by fetch, including setting their own headers if needed
  if (
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  ) {
    return { body: body as BodyInit }; // contentType left undefined to let fetch handle it
  }

  const requestedContentType = headers
    ? (headers['content-type'] ?? headers['Content-Type'])
    : undefined;
  const isFormUrlEncoded =
    formUrlEncoded === true ||
    (typeof requestedContentType === 'string' &&
      requestedContentType.toLowerCase().includes('application/x-www-form-urlencoded'));

  // Serialize to application/x-www-form-urlencoded if requested
  if (isFormUrlEncoded && typeof body === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        let strVal: string;
        if (typeof value === 'string') {
          strVal = value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          strVal = value.toString();
        } else {
          strVal = JSON.stringify(value);
        }
        params.append(key, strVal);
      }
    }
    return {
      body: params.toString(),
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    };
  }

  // Assume JSON for plain objects and arrays
  return { body: JSON.stringify(body), contentType: 'application/json' };
}
