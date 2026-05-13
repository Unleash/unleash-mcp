import { describe, expect, it } from 'vitest';
import { buildClientAttribution, parseAttributionEnv, sanitize } from './attribution.js';

describe('sanitize', () => {
  it('returns plain ASCII unchanged', () => {
    expect(sanitize('claude-code')).toBe('claude-code');
  });

  it('strips parentheses', () => {
    expect(sanitize('claude(code)')).toBe('claudecode');
  });

  it('strips semicolons', () => {
    expect(sanitize('claude;code')).toBe('claudecode');
  });

  it('strips control characters', () => {
    expect(sanitize('claude\x00code\x1f')).toBe('claudecode');
  });

  it('strips CR and LF', () => {
    expect(sanitize('claude\r\ncode')).toBe('claudecode');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitize('  claude-code  ')).toBe('claude-code');
  });

  it('truncates to 64 chars', () => {
    const input = 'a'.repeat(100);
    expect(sanitize(input)).toHaveLength(64);
  });

  it('returns empty string for input that becomes empty after stripping', () => {
    expect(sanitize('()()')).toBe('');
  });

  it('preserves dots, dashes, and digits', () => {
    expect(sanitize('claude-code/1.2.3-beta')).toBe('claude-code/1.2.3-beta');
  });
});

describe('parseAttributionEnv', () => {
  it('returns true when env var is undefined', () => {
    expect(parseAttributionEnv(undefined)).toBe(true);
  });

  it('returns true when env var is empty string', () => {
    expect(parseAttributionEnv('')).toBe(true);
  });

  it('returns false for "off"', () => {
    expect(parseAttributionEnv('off')).toBe(false);
  });

  it('returns false for "OFF" (case-insensitive)', () => {
    expect(parseAttributionEnv('OFF')).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(parseAttributionEnv('false')).toBe(false);
  });

  it('returns false for "0"', () => {
    expect(parseAttributionEnv('0')).toBe(false);
  });

  it('returns false for "no"', () => {
    expect(parseAttributionEnv('no')).toBe(false);
  });

  it('returns false ignoring surrounding whitespace', () => {
    expect(parseAttributionEnv('  off  ')).toBe(false);
  });

  it('returns true for any other value', () => {
    expect(parseAttributionEnv('on')).toBe(true);
    expect(parseAttributionEnv('1')).toBe(true);
    expect(parseAttributionEnv('yes')).toBe(true);
    expect(parseAttributionEnv('garbage')).toBe(true);
  });
});

describe('buildClientAttribution', () => {
  it('returns the attribution fragment when enabled with valid clientInfo', () => {
    expect(buildClientAttribution({ name: 'claude-code', version: '1.2.3' }, true)).toBe(
      'client=claude-code/1.2.3',
    );
  });

  it('returns empty string when attribution is disabled', () => {
    expect(buildClientAttribution({ name: 'claude-code', version: '1.2.3' }, false)).toBe('');
  });

  it('returns empty string when clientInfo is undefined', () => {
    expect(buildClientAttribution(undefined, true)).toBe('');
  });

  it('sanitizes parentheses and semicolons in name and version', () => {
    expect(buildClientAttribution({ name: 'claude(code)', version: '1;0' }, true)).toBe(
      'client=claudecode/10',
    );
  });

  it('returns empty string when name sanitizes to empty', () => {
    expect(buildClientAttribution({ name: '()', version: '1.0' }, true)).toBe('');
  });

  it('returns empty string when version sanitizes to empty', () => {
    expect(buildClientAttribution({ name: 'claude-code', version: ';' }, true)).toBe('');
  });

  it('truncates oversized name to 64 chars', () => {
    const result = buildClientAttribution({ name: 'a'.repeat(100), version: '1.0' }, true);
    expect(result.startsWith(`client=${'a'.repeat(64)}/`)).toBe(true);
  });
});
