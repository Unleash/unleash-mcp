import { describe, expect, it } from 'vitest';
import { CustomError } from '../utils/errors.js';
import { HttpClient } from './httpClient.js';

describe('HttpClient', () => {
  it('strips trailing slash from baseUrl and joins paths', async () => {
    const urls: string[] = [];
    const client = new HttpClient('https://example.com/', {
      fetch: async (url) => {
        urls.push(String(url));
        return new Response('{}');
      },
    });

    await client.requestJson('api/x', { method: 'GET' }, { errorMessage: 'x' });
    await client.requestJson('/api/y', { method: 'GET' }, { errorMessage: 'y' });
    expect(client.baseUrl).toBe('https://example.com');
    expect(urls).toEqual(['https://example.com/api/x', 'https://example.com/api/y']);
  });

  it('passes the request init, including headers, through to fetch untouched', async () => {
    let received: RequestInit | undefined;
    const client = new HttpClient('https://example.com', {
      fetch: async (_url, init) => {
        received = init;
        return new Response('{}');
      },
    });
    const init = { method: 'GET', headers: { Authorization: 'token', 'X-A': '1' } };

    await client.requestJson('/p', init, { errorMessage: 'x' });

    expect(received).toBe(init);
  });

  it('returns parsed JSON from requestJson', async () => {
    const client = new HttpClient('https://example.com', {
      fetch: async () => new Response('{"hello":"world"}'),
    });

    await expect(
      client.requestJson<{ hello: string }>('/p', { method: 'GET' }, { errorMessage: 'x' }),
    ).resolves.toEqual({ hello: 'world' });
  });

  it('uses the server message for non-2xx JSON error bodies', async () => {
    const client = new HttpClient('https://example.com', {
      fetch: async () => new Response('{"message":"nope"}', { status: 404 }),
    });

    await expect(
      client.request('/p', { method: 'DELETE' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_404', message: 'nope' });
  });

  it('joins details[].message when message is absent', async () => {
    const client = new HttpClient('https://example.com', {
      fetch: async () =>
        new Response('{"details":[{"message":"a"},{"message":"b"}]}', { status: 400 }),
    });

    await expect(
      client.request('/p', { method: 'POST' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_400', message: 'a, b' });
  });

  it('falls back to status text plus short raw body for non-JSON errors', async () => {
    const client = new HttpClient('https://example.com', {
      fetch: async () => new Response('boom', { status: 500, statusText: 'Server Error' }),
    });

    await expect(
      client.request('/p', { method: 'GET' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_500', message: 'Failed: 500 Server Error: boom' });
  });

  it('normalizes fetch network failures into NETWORK_ERROR with configured hint', async () => {
    const client = new HttpClient('https://example.com', {
      networkErrorMessage: 'Default network msg',
      networkErrorHint: 'Custom hint',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    const error = await client
      .request('/p', { method: 'GET' }, { errorMessage: 'Failed' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(CustomError);
    expect(error).toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Default network msg',
      hint: 'Custom hint',
    });
  });

  it('prefers per-request networkErrorMessage over the default', async () => {
    const client = new HttpClient('https://example.com', {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await expect(
      client.request(
        '/p',
        { method: 'GET' },
        { errorMessage: 'Failed', networkErrorMessage: 'Specific' },
      ),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: 'Specific' });
  });

  it('rethrows non-fetch errors unchanged', async () => {
    const boom = new Error('unrelated');
    const client = new HttpClient('https://example.com', {
      fetch: async () => {
        throw boom;
      },
    });

    await expect(client.request('/p', { method: 'GET' }, { errorMessage: 'Failed' })).rejects.toBe(
      boom,
    );
  });
});
