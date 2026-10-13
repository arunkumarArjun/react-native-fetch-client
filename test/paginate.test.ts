import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { parseNextLinkHeader } from '../src/paginate.js';

describe('Auto-Pagination Traverser (api.paginate)', () => {
  it('parses standard RFC 5988 / 8288 Link headers for rel="next"', () => {
    const header =
      '<https://api.example.com/items?page=2>; rel="next", <https://api.example.com/items?page=5>; rel="last"';
    expect(parseNextLinkHeader(header)).toBe('https://api.example.com/items?page=2');
    expect(parseNextLinkHeader('<https://api.example.com/items?page=1>; rel="prev"')).toBeNull();
    expect(parseNextLinkHeader(undefined)).toBeNull();
  });

  it('iterates through page-based pagination using async generator', async () => {
    const mockPages: Record<number, { items: Array<{ id: number; name: string }> }> = {
      1: {
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      },
      2: {
        items: [
          { id: 3, name: 'Charlie' },
          { id: 4, name: 'David' },
        ],
      },
      3: { items: [{ id: 5, name: 'Eve' }] },
    };

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const url = new URL(req.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      const data = mockPages[page] ?? { items: [] };
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });
    const collected: Array<{ id: number; name: string }> = [];

    for await (const user of client.paginate<{ id: number; name: string }>(
      'http://api.local/users',
      {
        pagination: {
          type: 'page',
          pageSize: 2,
        },
      },
    )) {
      collected.push(user);
    }

    expect(collected.length).toBe(5);
    expect(collected[0]?.name).toBe('Alice');
    expect(collected[4]?.name).toBe('Eve');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('collects all items directly into an array via api.paginate.all()', async () => {
    const mockPages: Record<number, number[]> = {
      1: [10, 20],
      2: [30, 40],
      3: [],
    };

    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const url = new URL(req.url);
      const page = Number(url.searchParams.get('p') ?? '1');
      const data = mockPages[page] ?? [];
      return Promise.resolve(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });

    const allItems = await client.paginate.all<number>('http://api.local/numbers', {
      pagination: {
        type: 'page',
        pageParam: 'p',
        pageSize: 2,
      },
    });

    expect(allItems).toEqual([10, 20, 30, 40]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('iterates through pages using api.paginate.pages()', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const url = new URL(req.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      return Promise.resolve(
        new Response(JSON.stringify({ page, data: [`item-${page}`] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = createClient({ fetchImpl: mockFetch });
    const pages: number[] = [];

    for await (const page of client.paginate.pages<{ page: number; data: string[] }>(
      'http://api.local/feed',
      {
        pagination: {
          maxPages: 3,
        },
      },
    )) {
      pages.push(page.data.page);
    }

    expect(pages).toEqual([1, 2, 3]);
  });

  it('supports cursor-based pagination with nextCursor extraction', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      const url = new URL(req.url);
      const cursor = url.searchParams.get('cursor');

      if (!cursor) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: ['a', 'b'], nextCursor: 'cur_2' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      if (cursor === 'cur_2') {
        return Promise.resolve(
          new Response(JSON.stringify({ items: ['c'], nextCursor: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [] })));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const items = await client.paginate.all<string>('http://api.local/cursor-feed', {
      pagination: {
        type: 'cursor',
        cursorParam: 'cursor',
      },
    });

    expect(items).toEqual(['a', 'b', 'c']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('supports RFC 5988 Link header pagination', async () => {
    const mockFetch = vi.fn().mockImplementation((req: Request) => {
      if (req.url === 'http://api.local/links') {
        return Promise.resolve(
          new Response(JSON.stringify(['page-1-item']), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              Link: '<http://api.local/links?page=2>; rel="next"',
            },
          }),
        );
      }
      if (req.url === 'http://api.local/links?page=2') {
        return Promise.resolve(
          new Response(JSON.stringify(['page-2-item']), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([])));
    });

    const client = createClient({ fetchImpl: mockFetch });
    const items = await client.paginate.all<string>('http://api.local/links', {
      pagination: {
        type: 'linkHeader',
      },
    });

    expect(items).toEqual(['page-1-item', 'page-2-item']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
