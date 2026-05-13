import { describe, expect, it } from 'vitest';
import { sanitize } from './attribution.js';

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
