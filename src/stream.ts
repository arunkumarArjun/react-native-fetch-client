/**
 * Native AI & Server-Sent Events (SSE) Streaming.
 *
 * Implements the WHATWG EventSource line-parsing specification using
 * standard `ReadableStream<Uint8Array>` and `TextDecoder`.
 *
 * Works in:
 * - Browsers
 * - Node.js 18+
 * - Cloudflare Workers
 * - Deno / Bun
 *
 * @module stream
 */

import type { StreamEvent, StreamOptions } from './types.js';

/**
 * Parses a WHATWG ReadableStream into an AsyncGenerator of StreamEvent objects.
 * Follows the W3C / WHATWG Server-Sent Events line format:
 * - `event: <name>`
 * - `data: <content>` (multiline supported via consecutive data lines)
 * - `id: <id>`
 * - `retry: <ms>`
 * - Blank line (`\n\n` or `\r\n\r\n`) dispatches the event.
 *
 * @param stream The response body ReadableStream to consume.
 * @param options Streaming configuration options (e.g. rawLines).
 * @returns An AsyncGenerator yielding parsed StreamEvent items.
 *
 * @example
 * ```ts
 * for await (const chunk of parseSseStream(response.body)) {
 *   console.log('SSE Event:', chunk.event, chunk.data);
 * }
 * ```
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options?: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let currentEvent: string | undefined;
  let currentData: string[] = [];
  let currentId: string | undefined;
  let currentRetry: number | undefined;

  const rawLines = options?.rawLines ?? false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split lines by \r\n, \r, or \n
      const lines = buffer.split(/\r\n|\r|\n/);
      // The last element is the unfinished trailing fragment
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (rawLines) {
          if (line.trim().length > 0) {
            yield { data: line };
          }
          continue;
        }

        // Blank line indicates the end of an SSE message block -> dispatch
        if (line.trim() === '') {
          if (currentData.length > 0 || currentEvent !== undefined || currentId !== undefined) {
            const eventPayload: StreamEvent = {
              data: currentData.join('\n'),
            };
            if (currentEvent !== undefined) {
              eventPayload.event = currentEvent;
            }
            if (currentId !== undefined) {
              eventPayload.id = currentId;
            }
            if (currentRetry !== undefined) {
              eventPayload.retry = currentRetry;
            }

            yield eventPayload;

            // Reset state for next event
            currentEvent = undefined;
            currentData = [];
            currentId = undefined;
            currentRetry = undefined;
          }
          continue;
        }

        // Lines starting with colon are comments; ignore per SSE spec
        if (line.startsWith(':')) {
          continue;
        }

        // Parse field and value
        let field = line;
        let valueStr = '';
        const colonIdx = line.indexOf(':');

        if (colonIdx !== -1) {
          field = line.substring(0, colonIdx);
          valueStr = line.substring(colonIdx + 1);
          // If value starts with a single space, strip it per spec
          if (valueStr.startsWith(' ')) {
            valueStr = valueStr.substring(1);
          }
        }

        switch (field) {
          case 'event':
            currentEvent = valueStr;
            break;
          case 'data':
            currentData.push(valueStr);
            break;
          case 'id':
            currentId = valueStr;
            break;
          case 'retry': {
            const parsed = parseInt(valueStr, 10);
            if (!Number.isNaN(parsed)) {
              currentRetry = parsed;
            }
            break;
          }
        }
      }
    }

    // Flush any remaining buffered message if there's no trailing blank line
    if (buffer.trim().length > 0) {
      const line = buffer;
      if (rawLines) {
        yield { data: line };
      } else if (!line.startsWith(':')) {
        let field = line;
        let valueStr = '';
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          field = line.substring(0, colonIdx);
          valueStr = line.substring(colonIdx + 1);
          if (valueStr.startsWith(' ')) {
            valueStr = valueStr.substring(1);
          }
        }
        if (field === 'data') {
          currentData.push(valueStr);
        } else if (field === 'event') {
          currentEvent = valueStr;
        } else if (field === 'id') {
          currentId = valueStr;
        }
      }
    }

    // Final dispatch if data remained in buffer
    if (!rawLines && (currentData.length > 0 || currentEvent !== undefined)) {
      const finalPayload: StreamEvent = {
        data: currentData.join('\n'),
      };
      if (currentEvent !== undefined) {
        finalPayload.event = currentEvent;
      }
      if (currentId !== undefined) {
        finalPayload.id = currentId;
      }
      if (currentRetry !== undefined) {
        finalPayload.retry = currentRetry;
      }
      yield finalPayload;
    }
  } finally {
    reader.releaseLock();
  }
}
