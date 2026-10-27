import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { MemoryStorageAdapter } from '../src/offline/storage.js';
import { createOfflineQueue } from '../src/offline/queue.js';
import { isHttpError } from '../src/errors.js';

describe('VAPT Security & Hygiene Protections', () => {
  describe('1. Cross-Origin Auth Token Isolation', () => {
    it('attaches auth token to same-origin relative and absolute paths', async () => {
      let capturedAuth: string | null = null;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        capturedAuth = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.mycompany.com',
        bearerToken: 'my-secret-access-token',
        fetchImpl,
      });

      // Relative path: matches baseURL origin
      await client.get('/profile');
      expect(capturedAuth).toBe('Bearer my-secret-access-token');

      // Absolute path matching same origin
      capturedAuth = null;
      await client.get('https://api.mycompany.com/v2/dashboard');
      expect(capturedAuth).toBe('Bearer my-secret-access-token');
    });

    it('omits auth token when requesting an untrusted cross-origin URL', async () => {
      let capturedAuth: string | null = null;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        capturedAuth = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.mycompany.com',
        bearerToken: 'my-secret-access-token',
        fetchImpl,
      });

      // Call external URL: cross-origin guard should drop authorization
      await client.get('https://external-cdn.com/asset.json');
      expect(capturedAuth).toBeNull();
    });

    it('permits cross-origin auth when explicitly opted-in via allowCrossOrigin', async () => {
      let capturedAuth: string | null = null;
      const fetchImpl = vi.fn().mockImplementation((req: Request) => {
        capturedAuth = req.headers.get('authorization');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createClient({
        baseURL: 'https://api.mycompany.com',
        bearerToken: 'my-secret-access-token',
        fetchImpl,
      });

      // Explicit request-level allowCrossOrigin
      await client.get('https://trusted-partner.com/api', {
        auth: { allowCrossOrigin: true },
      });
      expect(capturedAuth).toBe('Bearer my-secret-access-token');
    });

    it('does not trigger 401 refresh mutex on cross-origin failures', async () => {
      const refreshToken = vi.fn().mockResolvedValue('new-token');
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({
        baseURL: 'https://api.mycompany.com',
        fetchImpl,
        auth: {
          getToken: () => 'expired-token',
          refreshToken,
        },
      });

      // Cross-origin call fails with 401
      await expect(client.get('https://attacker.com/leak')).rejects.toThrow();

      // Refresh mutex should NOT be invoked by untrusted cross-origin endpoint
      expect(refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('2. Sensitive Header Redaction in Error Objects', () => {
    it('redacts Cookie, X-Api-Key, Authorization, and X-Auth-Token in error.config', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Bad Request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
      });

      try {
        await client.get('/test', {
          headers: {
            Authorization: 'Bearer super-secret-jwt',
            Cookie: 'session_id=secret-session-cookie',
            'X-Api-Key': 'key-12345',
            'X-Auth-Token': 'token-67890',
            'X-Custom-Public': 'public-val',
          },
        });
        expect.fail('Should have thrown HttpError');
      } catch (err: unknown) {
        expect(isHttpError(err)).toBe(true);
        if (isHttpError(err)) {
          const headers = err.config?.headers ?? {};
          expect(headers['authorization']).toBe('[REDACTED]');
          expect(headers['cookie']).toBe('[REDACTED]');
          expect(headers['x-api-key']).toBe('[REDACTED]');
          expect(headers['x-auth-token']).toBe('[REDACTED]');
          expect(headers['x-custom-public']).toBe('public-val');
        }
      }
    });
  });

  describe('3. Persistent Cache Disk Sanitization', () => {
    it('strips Set-Cookie and sensitive headers before saving to persistent storage', async () => {
      const storage = new MemoryStorageAdapter();
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: 'cached-content' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'secret_session_cookie=abc123xyz; Path=/; HttpOnly',
            'set-cookie2': 'cookie2_val',
            'x-cache-tag': 'public-tag',
          },
        }),
      );

      const client = createClient({
        baseURL: 'https://api.example.com',
        fetchImpl,
        cache: {
          enabled: true,
          storage,
          storageKey: 'vapt_cache_test',
        },
      });

      await client.get('/cached-resource');

      const rawPersisted = storage.getItem('vapt_cache_test');
      expect(rawPersisted).toBeTruthy();

      // Ensure cached payload exists
      expect(rawPersisted).toContain('cached-content');
      expect(rawPersisted).toContain('public-tag');

      // Crucial: Set-Cookie must be stripped and NEVER written to persistent disk
      expect(rawPersisted).not.toContain('secret_session_cookie');
      expect(rawPersisted).not.toContain('cookie2_val');
      expect(rawPersisted).not.toContain('set-cookie');
    });
  });

  describe('4. Offline Queue Plaintext Token Sanitization', () => {
    it('does not store plaintext Authorization headers in persistent offline queue', async () => {
      const storage = new MemoryStorageAdapter();
      const client = createClient({ baseURL: 'https://api.example.com' });

      const queue = createOfflineQueue({
        client,
        storage,
        storageKey: 'vapt_offline_test',
      });

      await queue.enqueue({
        url: '/sync-action',
        method: 'POST',
        headers: {
          Authorization: 'Bearer plaintext-secret-offline-token',
          'X-Correlation-Id': 'corr-999',
        },
      });

      const rawPersisted = storage.getItem('vapt_offline_test');
      expect(rawPersisted).toBeTruthy();

      // Custom non-sensitive header preserved
      expect(rawPersisted).toContain('corr-999');

      // Crucial: Authorization token must not be written in plaintext to disk
      expect(rawPersisted).not.toContain('plaintext-secret-offline-token');
    });
  });
});
