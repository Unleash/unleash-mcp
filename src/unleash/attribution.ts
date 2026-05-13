// biome-ignore lint/complexity/useRegexLiterals: a literal form trips noControlCharactersInRegex
const SANITIZE_PATTERN = new RegExp('[();\\x00-\\x1F\\x7F]', 'g');
const MAX_FIELD_LENGTH = 64;

export function sanitize(value: string): string {
  return value.replace(SANITIZE_PATTERN, '').trim().slice(0, MAX_FIELD_LENGTH);
}
