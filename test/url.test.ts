import { describe, it, expect } from 'vitest';
import { buildUrl } from '../src/url.js';

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
});
