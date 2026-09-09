import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEEDBACK_URL, FeedbackClient } from './feedbackClient.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeedbackClient endpoint', () => {
  it('defaults when no URL is configured', () => {
    expect(new FeedbackClient().endpoint).toBe(DEFAULT_FEEDBACK_URL);
  });

  it('appends /feedback to an instance base URL', () => {
    expect(new FeedbackClient('https://unleash.example.com/hosted').endpoint).toBe(
      'https://unleash.example.com/hosted/feedback',
    );
  });

  it('leaves a full endpoint URL alone, with or without a trailing slash', () => {
    expect(new FeedbackClient('https://sandbox.getunleash.io/enterprise/feedback').endpoint).toBe(
      'https://sandbox.getunleash.io/enterprise/feedback',
    );
    expect(new FeedbackClient('https://sandbox.getunleash.io/enterprise/feedback/').endpoint).toBe(
      'https://sandbox.getunleash.io/enterprise/feedback',
    );
  });

  it('assumes https when the scheme is omitted', () => {
    expect(new FeedbackClient('sandbox.getunleash.io/enterprise').endpoint).toBe(
      'https://sandbox.getunleash.io/enterprise/feedback',
    );
  });

  it('throws on a malformed override instead of falling back to production', () => {
    expect(() => new FeedbackClient('https://not a host')).toThrow(/not a valid URL/);
  });
});

describe('FeedbackClient.send', () => {
  const created = () => new Response('{}', { status: 201 });

  it('posts the report to the resolved endpoint', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(created());
    const client = new FeedbackClient('https://sandbox.getunleash.io/enterprise');

    const result = await client.send('no tool for project tags');

    expect(result).toEqual({ ok: true, status: 201 });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sandbox.getunleash.io/enterprise/feedback');
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

    expect(await new FeedbackClient(undefined, true).send('report')).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports a non-2xx without throwing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const result = await new FeedbackClient().send('report');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it('reports a network failure without throwing', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

    expect(await new FeedbackClient().send('report')).toEqual({
      ok: false,
      message: 'fetch failed',
    });
  });
});
