const CLIENTS_HIDING_CONSENT_PROMPT: readonly RegExp[] = [
  /opencode/i,
  /^cli$/i,
  /gemini/i,
  /antigravity/i,
];

export function showsConsentPrompt(clientName: string | undefined): boolean {
  if (!clientName) return false;
  return !CLIENTS_HIDING_CONSENT_PROMPT.some((pattern) => pattern.test(clientName));
}
