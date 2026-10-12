import { describe, it, expect, vi } from 'vitest';
import { parseSseStream, createClient, type StreamEvent } from '../src/index.js';

describe('Native AI & SSE Streaming', () => {
  it('parses Server-Sent Events stream correctly', async () => {
    const ssePayload = [
      'event: message\n',
      'id: 101\n',
      'data: Hello World\n\n',
      ': comment line should be ignored\n',
      'event: delta\n',
      'data: line 1\n',
      'data: line 2\n\n',
      'retry: 5000\n',
      'data: Final message\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const events: StreamEvent[] = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      event: 'message',
      id: '101',
      data: 'Hello World',
    });
    expect(events[1]).toEqual({
      event: 'delta',
      data: 'line 1\nline 2',
    });
    expect(events[2]).toEqual({
      data: 'Final message',
      retry: 5000,
    });
  });

  it('supports rawLines streaming mode', async () => {
    const rawContent = 'line 1\nline 2\nline 3\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(rawContent));
        controller.close();
      },
    });

    const lines: string[] = [];
    for await (const chunk of parseSseStream(stream, { rawLines: true })) {
      lines.push(chunk.data);
    }

    expect(lines).toEqual(['line 1', 'line 2', 'line 3']);
  });

  it('integrates with client.stream() method', async () => {
    const sseBody =
      'event: update\ndata: {"progress":50}\n\nevent: done\ndata: {"progress":100}\n\n';

    const mockFetch = vi.fn().mockImplementation(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody));
          controller.close();
        },
      });

      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });

    const collected: StreamEvent[] = [];
    for await (const chunk of client.stream('https://api.test/stream')) {
      collected.push(chunk);
    }

    expect(collected).toHaveLength(2);
    expect(collected[0]?.event).toBe('update');
    expect(collected[0]?.data).toBe('{"progress":50}');
    expect(collected[1]?.event).toBe('done');
    expect(collected[1]?.data).toBe('{"progress":100}');
  });
});
