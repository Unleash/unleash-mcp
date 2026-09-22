import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackHttpClient } from './feedbackHttpClient.js';

const BASE_URL = 'https://sandbox.getunleash.io/enterprise';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeedbackHttpClient.send', () => {
  const created = () => new Response('{}', { status: 201 });

  it('posts the report to /feedback under the instance base URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(created());
    const client = new FeedbackHttpClient(BASE_URL);

    const result = await client.send('no tool for project tags');

    expect(result).toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/feedback`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      category: 'mcp',
      userType: null,
      difficultyScore: null,
      positive: null,
      areasForImprovement: 'no tool for project tags',
    });
  });

  it('throws HTTP_<status> with the server message on a non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"message":"feedback disabled"}', { status: 503 }),
    );

    await expect(new FeedbackHttpClient(BASE_URL).send('report')).rejects.toMatchObject({
      name: 'CustomError',
      code: 'HTTP_503',
      message: 'feedback disabled',
    });
  });

  it('throws NETWORK_ERROR with a hint on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new FeedbackHttpClient(BASE_URL).send('report')).rejects.toMatchObject({
      name: 'CustomError',
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to the Unleash feedback endpoint',
      hint: `Check that the configured feedback URL (${BASE_URL}) is reachable.`,
    });
  });

  it('rethrows unknown errors unchanged', async () => {
    const boom = new Error('boom');
    vi.spyOn(global, 'fetch').mockRejectedValue(boom);

    await expect(new FeedbackHttpClient(BASE_URL).send('report')).rejects.toBe(boom);
  });
});
