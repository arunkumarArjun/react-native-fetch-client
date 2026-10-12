import { describe, it, expect } from 'vitest';
import { parseResponse } from '../src/parse.js';
import { ParseError } from '../src/errors.js';
import type { ResolvedRequestConfig } from '../src/types.js';

describe('parseResponse', () => {
  const dummyConfig = {} as unknown as ResolvedRequestConfig;

  it('returns null for responseType none', async () => {
    const res = new Response('data');
    expect(await parseResponse(res, 'none', dummyConfig)).toBeNull();
  });

  it('returns null for status 204', async () => {
    const res = new Response(null, { status: 204 });
    expect(await parseResponse(res, 'json', dummyConfig)).toBeNull();
  });

  it('parses JSON successfully', async () => {
    const res = new Response(JSON.stringify({ a: 1 }));
    expect(await parseResponse(res, 'json', dummyConfig)).toEqual({ a: 1 });
  });

  it('throws ParseError on invalid JSON', async () => {
    const res = new Response('invalid json');
    await expect(parseResponse(res, 'json', dummyConfig)).rejects.toThrow(ParseError);
  });

  it('returns text', async () => {
    const res = new Response('text data');
    expect(await parseResponse(res, 'text', dummyConfig)).toBe('text data');
  });
});
