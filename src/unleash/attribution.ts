// biome-ignore lint/complexity/useRegexLiterals: a literal form trips noControlCharactersInRegex
const SANITIZE_PATTERN = new RegExp('[();\\x00-\\x1F\\x7F]', 'g');
const MAX_FIELD_LENGTH = 64;

export function sanitize(value: string): string {
  return value.replace(SANITIZE_PATTERN, '').trim().slice(0, MAX_FIELD_LENGTH);
}

const DISABLED_VALUES = new Set(['off', 'false', '0', 'no']);

export function parseAttributionEnv(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return true;
  return !DISABLED_VALUES.has(normalized);
}

export type ClientInfo = { name: string; version: string };

export function buildClientAttribution(
  clientInfo: ClientInfo | undefined,
  attributionEnabled: boolean,
): string {
  if (!attributionEnabled || !clientInfo) return '';
  const name = sanitize(clientInfo.name);
  const version = sanitize(clientInfo.version);
  if (!name || !version) return '';
  return `client=${name}/${version}`;
}
