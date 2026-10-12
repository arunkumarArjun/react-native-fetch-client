import { describe, it, expect } from 'vitest';
import { createClient } from '../src/client.js';
import { createMockAdapter } from '../src/mock.js';
import { isHttpError, isNetworkError, isTimeoutError } from '../src/errors.js';

describe('Declarative Testing Mock Adapter (createMockAdapter)', () => {
  it('stubs GET and POST endpoints with status, data, and headers', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onGet('/users/1').reply(200, { id: 1, name: 'Alice' }, { 'x-mock': 'true' });
    mock.onPost('/users').reply(201, { id: 2, name: 'Bob' });

    const getRes = await client.get<{ id: number; name: string }>('/users/1');
    expect(getRes.status).toBe(200);
    expect(getRes.data.name).toBe('Alice');
    expect(getRes.headers['x-mock']).toBe('true');

    const postRes = await client.post<{ id: number; name: string }>('/users', { name: 'Bob' });
    expect(postRes.status).toBe(201);
    expect(postRes.data.name).toBe('Bob');

    // Verify history recording
    expect(mock.history.get.length).toBe(1);
    expect(mock.history.post.length).toBe(1);
    expect(mock.history.all.length).toBe(2);
  });

  it('matches URLs using regular expressions and dynamic reply callbacks', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onGet(/\/users\/(\d+)/).reply((config) => {
      const match = config.url.match(/\/users\/(\d+)/);
      const id = match ? Number(match[1]) : 0;
      return [200, { id, name: `User #${id}` }];
    });

    const res1 = await client.get<{ id: number; name: string }>('/users/42');
    expect(res1.data.id).toBe(42);
    expect(res1.data.name).toBe('User #42');

    const res2 = await client.get<{ id: number; name: string }>('/users/99');
    expect(res2.data.id).toBe(99);
  });

  it('simulates network timeout and connection failure errors', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onGet('/delay').replyWithTimeout();
    mock.onGet('/offline').replyWithNetworkError('Device is offline');

    await expect(client.get('/delay')).rejects.toSatisfy((err) => isTimeoutError(err));
    await expect(client.get('/offline')).rejects.toSatisfy((err) => isNetworkError(err));
  });

  it('throws HttpError when mock replies with 4xx or 5xx status', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onGet('/protected').reply(401, { error: 'Unauthorized token' });

    try {
      await client.get('/protected');
      expect.fail('Should have thrown HttpError');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      if (isHttpError(err)) {
        expect(err.status).toBe(401);
      }
    }
  });

  it('restores client to original behavior on mock.restore()', async () => {
    const client = createClient();
    const mock = createMockAdapter(client);

    mock.onGet('/test').reply(200, { mocked: true });
    const res = await client.get<{ mocked: boolean }>('/test');
    expect(res.data.mocked).toBe(true);

    mock.restore();
    expect(mock.history.all.length).toBe(0);
  });
});

