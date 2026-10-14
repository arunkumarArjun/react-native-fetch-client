import { describe, it, expect } from 'vitest';
import { buildUrl, isAbsoluteUrl } from '../src/url.js';

describe('buildUrl', () => {
  it('handles basic relative url with baseURL', () => {
    expect(buildUrl('/users', 'https://api.com')).toBe('https://api.com/users');
    expect(buildUrl('users', 'https://api.com/')).toBe('https://api.com/users');
  });

  it('ignores baseURL if url is absolute', () => {
    expect(buildUrl('https://other.com/api', 'https://api.com')).toBe('https://other.com/api');
  });

  it('appends query parameters', () => {
    expect(buildUrl('/users', 'https://api.com', { id: 1, active: true })).toBe(
      'https://api.com/users?id=1&active=true',
    );
  });

  it('preserves existing query parameters', () => {
    expect(buildUrl('/users?sort=desc', 'https://api.com', { id: 1 })).toBe(
      'https://api.com/users?sort=desc&id=1',
    );
  });

  it('filters out null or undefined query parameters', () => {
    expect(buildUrl('/users', 'https://api.com', { a: 1, b: null, c: undefined, d: 2 })).toBe(
      'https://api.com/users?a=1&d=2',
    );
  });

  it('handles multiple leading and trailing slashes safely (linear complexity / ReDoS safe)', () => {
    expect(buildUrl('/users', 'https://api.com///')).toBe('https://api.com/users');
    expect(buildUrl('/users/', 'https://api.com///')).toBe('https://api.com/users/');
    expect(buildUrl('', 'https://api.com///')).toBe('https://api.com');

    // ReDoS resistance test: ensure string with thousands of slashes finishes instantaneously
    const longSlashes = 'https://api.com' + '/'.repeat(10_000);
    const start = Date.now();
    const result = buildUrl('/path', longSlashes);
    const elapsed = Date.now() - start;
    expect(result).toBe('https://api.com/path');
    expect(elapsed).toBeLessThan(50); // Linear trimming takes < 2ms
  });
});

describe('isAbsoluteUrl', () => {
  it('identifies standard protocol schemes as absolute', () => {
    expect(isAbsoluteUrl('https://api.example.com')).toBe(true);
    expect(isAbsoluteUrl('http://localhost:3000/v1')).toBe(true);
    expect(isAbsoluteUrl('ftp://ftp.example.com/file')).toBe(true);
    expect(isAbsoluteUrl('custom-scheme://host/path')).toBe(true);
  });

  it('identifies protocol-relative URLs as absolute', () => {
    expect(isAbsoluteUrl('//cdn.example.com/lib.js')).toBe(true);
  });

  it('identifies relative URLs as not absolute', () => {
    expect(isAbsoluteUrl('/users')).toBe(false);
    expect(isAbsoluteUrl('users')).toBe(false);
    expect(isAbsoluteUrl('users/123')).toBe(false);
    expect(isAbsoluteUrl('')).toBe(false);
    expect(isAbsoluteUrl('localhost:3000/users')).toBe(false);
  });
});
