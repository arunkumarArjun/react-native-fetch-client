import { ParseError } from './errors.js';
import type { ResponseType, ResolvedRequestConfig, ProgressEvent } from './types.js';

async function readBodyWithProgress(
  response: Response,
  onProgress?: (event: ProgressEvent) => void,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const ab = await response.arrayBuffer();
    const u8 = new Uint8Array(ab);
    if (onProgress) {
      onProgress({
        loaded: u8.length,
        total: u8.length,
        progress: 1,
        bytes: u8.length,
      });
    }
    return u8;
  }

  const contentLengthHeader = response.headers.get('content-length');
  const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;
  const isTotalValid = total !== undefined && !isNaN(total) && total >= 0;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      if (onProgress) {
        const event: ProgressEvent = {
          loaded,
          bytes: value.length,
        };
        if (isTotalValid) {
          event.total = total;
          event.progress = loaded / total;
        }
        onProgress(event);
      }
    }
  }

  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

export async function parseResponse(
  response: Response,
  responseType: ResponseType,
  config: ResolvedRequestConfig,
  onDownloadProgress?: (event: ProgressEvent) => void,
): Promise<unknown> {
  if (responseType === 'none' || response.status === 204) {
    // Consume body to free up memory (needed in some environments)
    await response.text().catch(() => {});
    return null;
  }

  if (responseType === 'stream') {
    return response.body;
  }

  let bodyBytes: Uint8Array | undefined;
  if (onDownloadProgress) {
    bodyBytes = await readBodyWithProgress(response, onDownloadProgress);
  }

  if (responseType === 'json') {
    let text: string;
    if (bodyBytes) {
      text = new TextDecoder().decode(bodyBytes);
    } else {
      text = await response.text();
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ParseError('Failed to parse JSON response', {
        status: response.status,
        rawBody: text,
        config,
        cause: err,
      });
    }
  }

  if (responseType === 'text') {
    if (bodyBytes) return new TextDecoder().decode(bodyBytes);
    return response.text();
  }

  if (responseType === 'blob') {
    if (bodyBytes) {
      const mime = response.headers.get('content-type') ?? '';
      return new Blob([bodyBytes.buffer as ArrayBuffer], { type: mime });
    }
    return response.blob();
  }

  if (responseType === 'arrayBuffer') {
    if (bodyBytes) return bodyBytes.buffer;
    return response.arrayBuffer();
  }

  if (bodyBytes) return new TextDecoder().decode(bodyBytes);
  return response.text();
}
