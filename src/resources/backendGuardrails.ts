import { Resource } from '@modelcontextprotocol/sdk/types.js';

const BACKEND_GUARDRAILS_URI = 'unleash://guides/backend-guardrails';

export const backendGuardrailsResource: Resource = {
  uri: BACKEND_GUARDRAILS_URI,
  name: 'Backend Change Guardrails',
  description:
    'Server-side checklist for edits in src/lib, src/unleash, or API layers. Highlights when to call prepare_local_change and evaluate_change before touching code.',
  mimeType: 'text/markdown',
};

export function buildBackendGuardrailsDocument(): string {
  const lines: string[] = [
    '# Backend Change Guardrails',
    '',
    'When working on server-side code (e.g., `src/lib`, `src/unleash`, API controllers, services):',
    '',
    '1. **Call `prepare_local_change` first.** Capture the task summary and let the MCP list impacted files, repo commands, and guardrails before editing anything.',
    '2. **Call `evaluate_change`** with the plan. Backend changes often affect rollout and risk; the tool will tell you if a feature flag is required.',
    '3. **Check for existing flags** around the area. If wrapping new logic, plan to reuse or extend those flags before creating a new one.',
    '4. **Use `wrap_change`** once a flag is confirmed so the snippet matches the project conventions.',
    '5. **Summarize the diff with `apply_patch` and run `run_checks`** (formatter, linter, tests) before finishing.',
    '',
    'Extra considerations:',
    '',
    '- Document rollout and cleanup expectations in the change description.',
    '- Update or add backend tests to cover enabled/disabled flag paths.',
    '- Watch for database or integration side effects that may require gradual rollout.',
  ];

  return lines.join('\n');
}

export function isBackendGuardrailsUri(uri: string): boolean {
  return uri === BACKEND_GUARDRAILS_URI;
}
