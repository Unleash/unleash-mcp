import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FEEDBACK_BASE_URL,
  hasTrailingApiSegment,
  loadConfig,
  normalizeBaseUrl,
  resolveFeedbackBaseUrl,
} from './config.js';

describe('normalizeBaseUrl', () => {
  it('returns the URL unchanged when there is no trailing slash or /api', () => {
    expect(normalizeBaseUrl('https://x.getunleash.io')).toBe('https://x.getunleash.io/');
  });

  it('strips a trailing slash', () => {
    expect(normalizeBaseUrl('https://x.getunleash.io/')).toBe('https://x.getunleash.io/');
  });

  it('strips a trailing /api', () => {
    expect(normalizeBaseUrl('https://x.getunleash.io/api')).toBe('https://x.getunleash.io/');
  });

  it('strips a trailing /api/ (with trailing slash)', () => {
    expect(normalizeBaseUrl('https://x.getunleash.io/api/')).toBe('https://x.getunleash.io/');
  });

  it('preserves a path prefix when stripping a trailing /api (self-hosted with subpath)', () => {
    expect(normalizeBaseUrl('https://example.com/unleash/api')).toBe('https://example.com/unleash');
  });

  it('does NOT strip /api-v2 (must be a complete segment)', () => {
    expect(normalizeBaseUrl('https://example.com/api-v2')).toBe('https://example.com/api-v2');
  });

  it('does NOT strip /api when it is followed by another segment (e.g. /api/admin)', () => {
    expect(normalizeBaseUrl('https://example.com/api/admin')).toBe('https://example.com/api/admin');
  });

  it('collapses double slashes in the pathname', () => {
    expect(normalizeBaseUrl('https://example.com//foo//bar')).toBe('https://example.com/foo/bar');
  });

  it('strips /api after collapsing double slashes', () => {
    expect(normalizeBaseUrl('https://example.com//api//')).toBe('https://example.com/');
  });

  it('handles localhost URLs with /api', () => {
    expect(normalizeBaseUrl('http://localhost:4242/api')).toBe('http://localhost:4242/');
  });

  it('returns the URL unchanged when /api is in the middle of a longer path', () => {
    expect(normalizeBaseUrl('https://example.com/foo/api/bar')).toBe(
      'https://example.com/foo/api/bar',
    );
  });

  it('falls back to regex-only normalization for non-URL inputs', () => {
    // The fallback is reached when `new URL()` throws — e.g. for strings that
    // aren't valid URLs. The fallback still strips trailing slashes and /api.
    expect(normalizeBaseUrl('not-a-url/api/')).toBe('not-a-url');
    expect(normalizeBaseUrl('not-a-url')).toBe('not-a-url');
  });

  it('is idempotent — running it twice yields the same result', () => {
    const inputs = [
      'https://x.getunleash.io',
      'https://x.getunleash.io/api',
      'https://x.getunleash.io/api/',
      'https://example.com/unleash/api',
      'http://localhost:4242/api',
    ];

    for (const input of inputs) {
      const once = normalizeBaseUrl(input);
      const twice = normalizeBaseUrl(once);
      expect(twice).toBe(once);
    }
  });
});

describe('hasTrailingApiSegment', () => {
  it('detects /api at the end of the pathname', () => {
    expect(hasTrailingApiSegment('https://x.getunleash.io/api')).toBe(true);
  });

  it('detects /api/ (with trailing slash)', () => {
    expect(hasTrailingApiSegment('https://x.getunleash.io/api/')).toBe(true);
  });

  it('returns false when there is no /api', () => {
    expect(hasTrailingApiSegment('https://x.getunleash.io')).toBe(false);
    expect(hasTrailingApiSegment('https://x.getunleash.io/')).toBe(false);
  });

  it('returns false for /api-v2 or other false-positive shapes', () => {
    expect(hasTrailingApiSegment('https://example.com/api-v2')).toBe(false);
    expect(hasTrailingApiSegment('https://example.com/api/admin')).toBe(false);
  });

  it('detects /api on a path-prefixed self-hosted URL', () => {
    expect(hasTrailingApiSegment('https://example.com/unleash/api')).toBe(true);
  });

  it('handles non-URL inputs without throwing', () => {
    expect(hasTrailingApiSegment('not-a-url/api')).toBe(true);
    expect(hasTrailingApiSegment('not-a-url')).toBe(false);
  });
});

describe('resolveFeedbackBaseUrl', () => {
  it('defaults to the sandbox when no URL is configured', () => {
    expect(resolveFeedbackBaseUrl()).toBe(DEFAULT_FEEDBACK_BASE_URL);
    expect(resolveFeedbackBaseUrl('')).toBe(DEFAULT_FEEDBACK_BASE_URL);
    expect(resolveFeedbackBaseUrl('  ')).toBe(DEFAULT_FEEDBACK_BASE_URL);
  });

  it('returns an http(s) instance base URL unchanged', () => {
    expect(resolveFeedbackBaseUrl('https://unleash.example.com/hosted')).toBe(
      'https://unleash.example.com/hosted',
    );
    expect(resolveFeedbackBaseUrl('http://localhost:4242/hosted')).toBe(
      'http://localhost:4242/hosted',
    );
  });

  it('strips a trailing slash', () => {
    expect(resolveFeedbackBaseUrl('https://unleash.example.com/hosted/')).toBe(
      'https://unleash.example.com/hosted',
    );
  });

  it.each([
    ['a scheme-less host', 'unleash.example.com/hosted'],
    ['a non-http scheme', 'ftp://unleash.example.com/hosted'],
    ['a malformed URL', 'https://not a host'],
  ])('rejects %s instead of falling back to the default', (_label, value) => {
    expect(() => resolveFeedbackBaseUrl(value)).toThrow(/absolute http\(s\) instance base URL/);
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    vi.stubEnv('UNLEASH_BASE_URL', 'https://unleash.example.com');
    vi.stubEnv('UNLEASH_PAT', 'user:token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the feedback URL from the environment', () => {
    vi.stubEnv('UNLEASH_FEEDBACK_URL', 'https://feedback.example.com/hosted');

    expect(loadConfig().unleash.feedbackUrl).toBe('https://feedback.example.com/hosted');
  });
});
