const CLIENTS_HIDING_ELICITATION_FORMS: readonly RegExp[] = [
  /opencode/i,
  /^cli$/i,
  /gemini/i,
  /antigravity/i,
];

export function showsElicitationForms(clientName: string | undefined): boolean {
  if (!clientName) return false;
  return !CLIENTS_HIDING_ELICITATION_FORMS.some((pattern) => pattern.test(clientName));
}
