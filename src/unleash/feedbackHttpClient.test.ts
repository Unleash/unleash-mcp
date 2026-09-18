import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEEDBACK_URL, FeedbackHttpClient } from './feedbackHttpClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeedbackHttpClient endpoint', () => {
  it('defaults when no URL is configured', () => {
    expect(new FeedbackHttpClient().endpoint).toBe(DEFAULT_FEEDBACK_URL);
    expect(new FeedbackHttpClient('  ').endpoint).toBe(DEFAULT_FEEDBACK_URL);
  });

  it('appends /feedback to an instance base URL', () => {
    expect(new FeedbackHttpClient('https://unleash.example.com/hosted').endpoint).toBe(
      'https://unleash.example.com/hosted/feedback',
    );
  });

  it('appends /feedback to a bare host', () => {
    expect(new FeedbackHttpClient('https://unleash.example.com').endpoint).toBe(
      'https://unleash.example.com/feedback',
    );
  });

  it('leaves a full endpoint URL alone, with or without a trailing slash', () => {
    expect(
      new FeedbackHttpClient('https://sandbox.getunleash.io/enterprise/feedback').endpoint,
    ).toBe('https://sandbox.getunleash.io/enterprise/feedback');
    expect(
      new FeedbackHttpClient('https://sandbox.getunleash.io/enterprise/feedback/').endpoint,
    ).toBe('https://sandbox.getunleash.io/enterprise/feedback');
  });

  it('assumes https when the scheme is omitted', () => {
    expect(new FeedbackHttpClient('sandbox.getunleash.io/enterprise').endpoint).toBe(
      'https://sandbox.getunleash.io/enterprise/feedback',
    );
  });

  it('throws on a malformed override instead of falling back to production', () => {
    expect(() => new FeedbackHttpClient('https://not a host')).toThrow(/not a valid URL/);
  });
});

describe('FeedbackHttpClient.send', () => {
  const created = () => new Response('{}', { status: 201 });

  it('posts the report to the resolved endpoint', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(created());
    const client = new FeedbackHttpClient('https://sandbox.getunleash.io/enterprise');

    const result = await client.send('no tool for project tags');

    expect(result).toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sandbox.getunleash.io/enterprise/feedback');
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

  it('skips the request in dry-run mode', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    await expect(new FeedbackHttpClient(undefined, true).send('report')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws HTTP_<status> with the server message on a non-2xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"message":"feedback disabled"}', { status: 503 }),
    );

    await expect(new FeedbackHttpClient().send('report')).rejects.toMatchObject({
      name: 'CustomError',
      code: 'HTTP_503',
      message: 'feedback disabled',
    });
  });

  it('throws NETWORK_ERROR with a hint on a network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    await expect(new FeedbackHttpClient().send('report')).rejects.toMatchObject({
      name: 'CustomError',
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to the Unleash feedback endpoint',
      hint: `Check that UNLEASH_FEEDBACK_URL (${DEFAULT_FEEDBACK_URL}) is reachable.`,
    });
  });

  it('rethrows unknown errors unchanged', async () => {
    const boom = new Error('boom');
    vi.spyOn(global, 'fetch').mockRejectedValue(boom);

    await expect(new FeedbackHttpClient().send('report')).rejects.toBe(boom);
  });
});
