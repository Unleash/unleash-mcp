import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomError } from '../utils/errors.js';
import { HttpClient } from './httpClient.js';

interface MockResponse {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
}

function mockFetch(response: MockResponse) {
  const { text: body = '', ...rest } = response;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body,
    json: async () => JSON.parse(body),
    ...rest,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('HttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips trailing slash from baseUrl and joins paths', async () => {
    const fetchMock = mockFetch({ text: '{}' });
    const client = new HttpClient('https://example.com/');

    await client.requestJson('api/x', { method: 'GET' }, { errorMessage: 'x' });
    await client.requestJson('/api/y', { method: 'GET' }, { errorMessage: 'y' });

    expect(client.baseUrl).toBe('https://example.com');
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api/x');
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/api/y');
  });

  it('passes the request init, including headers, through to fetch untouched', async () => {
    const fetchMock = mockFetch({ text: '{}' });
    const client = new HttpClient('https://example.com');
    const init = { method: 'GET', headers: { Authorization: 'token', 'X-A': '1' } };

    await client.requestJson('/p', init, { errorMessage: 'x' });

    expect(fetchMock.mock.calls[0][1]).toBe(init);
  });

  it('returns parsed JSON from requestJson', async () => {
    mockFetch({ text: '{"hello":"world"}' });
    const client = new HttpClient('https://example.com');

    await expect(
      client.requestJson<{ hello: string }>('/p', { method: 'GET' }, { errorMessage: 'x' }),
    ).resolves.toEqual({ hello: 'world' });
  });

  it('uses the server message for non-2xx JSON error bodies', async () => {
    mockFetch({ ok: false, status: 404, statusText: 'Not Found', text: '{"message":"nope"}' });
    const client = new HttpClient('https://example.com');

    await expect(
      client.request('/p', { method: 'DELETE' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_404', message: 'nope' });
  });

  it('joins details[].message when message is absent', async () => {
    mockFetch({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: '{"details":[{"message":"a"},{"message":"b"}]}',
    });
    const client = new HttpClient('https://example.com');

    await expect(
      client.request('/p', { method: 'POST' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_400', message: 'a, b' });
  });

  it('falls back to status text plus short raw body for non-JSON errors', async () => {
    mockFetch({ ok: false, status: 500, statusText: 'Server Error', text: 'boom' });
    const client = new HttpClient('https://example.com');

    await expect(
      client.request('/p', { method: 'GET' }, { errorMessage: 'Failed' }),
    ).rejects.toMatchObject({ code: 'HTTP_500', message: 'Failed: 500 Server Error: boom' });
  });

  it('normalizes fetch network failures into NETWORK_ERROR with configured hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const client = new HttpClient('https://example.com', {
      networkErrorMessage: 'Default network msg',
      networkErrorHint: 'Custom hint',
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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const client = new HttpClient('https://example.com');

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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom));
    const client = new HttpClient('https://example.com');

    await expect(client.request('/p', { method: 'GET' }, { errorMessage: 'Failed' })).rejects.toBe(
      boom,
    );
  });
});
