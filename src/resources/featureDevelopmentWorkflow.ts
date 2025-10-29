import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { Config } from '../config.js';

const FEATURE_DEVELOPMENT_URI = 'unleash://guides/feature-development-workflow';

export const featureDevelopmentWorkflowResource: Resource = {
  uri: FEATURE_DEVELOPMENT_URI,
  name: 'Feature Development Workflow',
  description:
    'Start here when you are implementing a feature or risky change. Explains when to call evaluate_change, create_flag, and wrap_change.',
  mimeType: 'text/markdown',
};

export function buildFeatureDevelopmentWorkflowDocument(config: Config): string {
  const lines: Array<string | undefined> = [
    '# Feature Development with Unleash MCP',
    '',
    'Use this workflow whenever you begin a product change. It keeps work safely gated behind Unleash feature flags and tells the LLM which tool to call next.',
    '',
    '> Planning anything from a small safety refactor to a platform-wide initiative? Capture the intent and known touchpoints in **`prepare_local_change`** and **`evaluate_change`** before writing code so you can outline discovery steps, flag needs, and rollout strategy up front—even if diff files are not ready yet.',
    '',
    '## 1. Assess the change first',
    '',
    '- Call **`prepare_local_change`** with the task summary to gather guardrails, repo commands, and suggested next steps.',
    '- Follow up with **`evaluate_change`** as soon as a new feature or risky modification is mentioned.',
    '- Provide repo, branch, files, and any risk notes so the evaluation can score the change.',
    '- Follow the JSON result. When it says a flag is needed, move to creation immediately.',
    '',
    '## 2. Create the flag if required',
    '',
    '- Use **`create_flag`** with the recommended flag name, type, and description from the evaluation output.',
    '- Keep descriptions explicit about rollout intent and clean-up expectations.',
    config.unleash.defaultProject
      ? `- Default project detected: \`${config.unleash.defaultProject}\`. Override only when the work belongs elsewhere.`
      : undefined,
    config.server.dryRun
      ? '- Server is running in **dry-run** mode. The tool will validate inputs and log the request without calling Unleash.'
      : undefined,
    '',
    '## 3. Wrap the implementation',
    '',
    '- Call **`wrap_change`** immediately after flag creation (or when reusing an existing flag).',
    '- Provide the target file name and any code context so the tool can detect conventions and suggest matching templates.',
    '- Apply the recommended snippet, then test the guarded code path.',
    '',
    '## 4. Close the loop',
    '',
    '- Confirm tests or QA plans cover both flag states.',
    '- Record rollout decisions (gradual rollout, kill switches, cleanup owner).',
    '- If the evaluation reported “no new flag”, document why and proceed without flag creation.',
    '',
    '### Quick Decision Checklist',
    '',
    '1. Did we already check for parent flags? → `evaluate_change` helps surface them.',
    '2. Do we understand rollout impact? → The evaluation guidance cites Unleash best practices.',
    '3. Are we mirroring existing code conventions? → `wrap_change` detects patterns when you pass code context.',
    '',
    'Keep this workflow in mind: **prepare → evaluate → create → wrap → verify**. The LLM should reach for these tools without waiting for the user to ask.',
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

export function isFeatureDevelopmentWorkflowUri(uri: string): boolean {
  return uri === FEATURE_DEVELOPMENT_URI;
}
