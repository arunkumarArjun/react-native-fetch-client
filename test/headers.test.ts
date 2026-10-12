import { describe, it, expect } from 'vitest';
import { mergeHeaders } from '../src/headers.js';

describe('mergeHeaders', () => {
  it('merges headers objects case-insensitively', () => {
    const res = mergeHeaders({ 'Content-Type': 'application/json' }, { Accept: 'text/plain' });
    expect(res).toEqual({ 'content-type': 'application/json', accept: 'text/plain' });
  });

  it('later headers override earlier headers', () => {
    const res = mergeHeaders(
      { 'Content-Type': 'application/json' },
      { 'content-type': 'text/html' },
    );
    expect(res).toEqual({ 'content-type': 'text/html' });
  });

  it('handles undefined or null header objects gracefully', () => {
    const res = mergeHeaders({ a: '1' }, undefined, { b: '2' });
    expect(res).toEqual({ a: '1', b: '2' });
  });
});
