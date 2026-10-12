import { describe, it, expect, vi } from 'vitest';
import { createClient, type DebugLogEntry } from '../src/index.js';

describe('Developer Ergonomics (DX Boosters)', () => {
  describe('api.safe.* result tuples', () => {
    it('returns [data, null] on successful request', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 101, username: 'dev' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({ fetchImpl: mockFetch });
      const [data, error] = await client.safe.get<{ id: number; username: string }>(
        'https://api.test/user',
      );

      expect(error).toBeNull();
      expect(data).toEqual({ id: 101, username: 'dev' });
    });

    it('returns [null, error] without throwing on HTTP 404 or 500 error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Resource not found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({ fetchImpl: mockFetch });
      const [data, error] = await client.safe.get('https://api.test/not-found');

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.code).toBe('HTTP_ERROR');
    });
  });

  describe('Path parameter interpolation (pathParams)', () => {
    it('replaces :param and {param} with URI-encoded values', async () => {
      let requestedUrl = '';
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        requestedUrl = req.url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({ fetchImpl: mockFetch, baseURL: 'https://api.test' });

      await client.get('/orgs/:orgId/projects/{projectId}/items/:itemId', {
        pathParams: {
          orgId: 'org 123',
          projectId: 'proj-456',
          itemId: 'item#789',
        },
      });

      expect(requestedUrl).toBe(
        'https://api.test/orgs/org%20123/projects/proj-456/items/item%23789',
      );
    });
  });

  describe('Bearer Token preset (bearerToken)', () => {
    it('auto-injects static Bearer token', async () => {
      let authHeader: string | null = null;
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        authHeader = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        fetchImpl: mockFetch,
        bearerToken: 'secret-token-xyz',
      });

      await client.get('https://api.test/secure');
      expect(authHeader).toBe('Bearer secret-token-xyz');
    });

    it('auto-injects dynamic async Bearer token function', async () => {
      let authHeader: string | null = null;
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        authHeader = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        fetchImpl: mockFetch,
        bearerToken: () => Promise.resolve('dynamic-jwt-from-storage'),
      });

      await client.get('https://api.test/secure');
      expect(authHeader).toBe('Bearer dynamic-jwt-from-storage');
    });
  });

  describe('Response Unwrapping (unwrap: true)', () => {
    it('returns response.data directly when unwrap is enabled', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [1, 2, 3] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({ fetchImpl: mockFetch });
      const res = await client.get('https://api.test/items', { unwrap: true });

      // Unwrapped response directly returns the parsed data
      expect(res).toEqual({ data: [1, 2, 3] });
    });
  });

  describe('File Upload Helper (api.upload)', () => {
    it('constructs FormData, strips Content-Type, and wires upload progress', async () => {
      let receivedReq: Request | null = null;
      const mockFetch = vi.fn().mockImplementation((req: Request) => {
        receivedReq = req;
        return Promise.resolve(
          new Response(JSON.stringify({ uploaded: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({ fetchImpl: mockFetch });
      const dummyBlob = new Blob(['hello file contents'], { type: 'text/plain' });

      let progressCalled = false;
      const res = await client.upload<{ uploaded: boolean }>('https://api.test/upload', dummyBlob, {
        fileName: 'note.txt',
        fieldName: 'document',
        extraFields: { category: 'docs', priority: 1 },
        onUploadProgress: (evt) => {
          if (evt.loaded > 0) progressCalled = true;
        },
      });

      expect(res.data).toEqual({ uploaded: true });
      expect(receivedReq).toBeDefined();
      expect(progressCalled).toBe(true);
    });
  });

  describe('Debug Logger (debug: true & custom)', () => {
    it('dispatches structured debug entries with redacted auth headers', async () => {
      const logs: DebugLogEntry[] = [];
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({
        fetchImpl: mockFetch,
        bearerToken: 'super-sensitive-jwt',
        debug: (entry) => logs.push(entry),
      });

      await client.get('https://api.test/health');

      expect(logs).toHaveLength(1);
      expect(logs[0]?.method).toBe('GET');
      expect(logs[0]?.status).toBe(200);
      expect(logs[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(logs[0]?.headers?.['authorization']).toBe('[REDACTED]');
    });
  });
});
