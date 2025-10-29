import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { Config } from '../config.js';

const LOCAL_CHANGE_CHECKLIST_URI = 'unleash://guides/local-change-checklist';

export const localChangeChecklistResource: Resource = {
  uri: LOCAL_CHANGE_CHECKLIST_URI,
  name: 'Local Change Checklist',
  description:
    'Checklist for preparing local modifications. Highlights prepare_local_change, evaluate_change, and repo guardrails to keep work safe.',
  mimeType: 'text/markdown',
};

export function buildLocalChangeChecklistDocument(config: Config): string {
  const lines: string[] = [
    '# Local Change Checklist',
    '',
    'Follow this sequence before touching code:',
    '',
    '0. If you are unsure whether this is a local code change, call **`decide_local_flow`**.',
    '1. **Call `prepare_local_change`** with the task summary to collect guardrails, suggested files, and test commands.',
    '2. Review the output and open any referenced resources (project guardrails, documentation links).',
    '3. **Call `evaluate_change`** with the planned work (even if you only have a proposal) to assess flag needs and risk.',
    '4. If a flag is required, **call `create_flag`**, then **`wrap_change`** to get language-specific snippets.',
    '5. Implement the smallest safe diff, run the recommended checks, and capture follow-up tasks.',
    '',
    '## Quick Hints',
    '',
    '- Keep scopes tight; prefer iterative changes gated behind the new flag.',
    '- Surface risky or high-impact areas (auth, payments, migrations) in the tool inputs.',
    '- Note cleanup expectations so rollout is planned from the start.',
    '- Use `unleash://workspace/summary` to recall formatter/linter/test commands quickly.',
    '',
    config.unleash.defaultProject
      ? `Default project: \`${config.unleash.defaultProject}\``
      : 'Set `UNLEASH_DEFAULT_PROJECT` to avoid passing projectId manually.',
    config.server.dryRun
      ? 'Running in **dry-run** mode: Unleash API calls are validated but not executed.'
      : undefined,
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function isLocalChangeChecklistUri(uri: string): boolean {
  return uri === LOCAL_CHANGE_CHECKLIST_URI;
}
