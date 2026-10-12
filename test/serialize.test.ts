import { describe, it, expect } from 'vitest';
import { serializeBody } from '../src/serialize.js';

describe('serializeBody', () => {
  it('returns null for null or undefined', () => {
    expect(serializeBody(null)).toEqual({ body: null });
    expect(serializeBody(undefined)).toEqual({ body: null });
  });

  it('handles strings', () => {
    expect(serializeBody('hello')).toEqual({ body: 'hello', contentType: 'text/plain' });
  });

  it('handles JSON objects', () => {
    expect(serializeBody({ a: 1 })).toEqual({ body: '{"a":1}', contentType: 'application/json' });
  });

  it('handles URLSearchParams', () => {
    const params = new URLSearchParams({ a: '1' });
    expect(serializeBody(params)).toEqual({ body: params }); // contentType undefined
  });
});
