import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';

const prepareLocalChangeSchema = z.object({
  task: z.string().min(1, 'task is required').describe('Summary of the requested change or refactor'),
  hints: z
    .array(z.string())
    .optional()
    .describe('Optional hints such as suspected file paths or components involved'),
});

type PrepareLocalChangeInput = z.infer<typeof prepareLocalChangeSchema>;

type RepoSignals = {
  formatter?: string;
  linter?: string;
  tests?: string;
  build?: string;
};

async function discoverRepoSignals(): Promise<RepoSignals> {
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const raw = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    const signals: RepoSignals = {};
    if (scripts.format) {
      signals.formatter = scripts.format;
    }
    if (scripts.lint) {
      signals.linter = scripts.lint;
    }
    if (scripts.test) {
      signals.tests = scripts.test;
    }
    if (scripts.build) {
      signals.build = scripts.build;
    }
    return signals;
  } catch {
    // Silently ignore if package.json is unavailable
    return {};
  }
}

function toCommandList(signals: RepoSignals): string[] {
  const commands: string[] = [];
  if (signals.formatter) {
    commands.push(`Formatter: ${signals.formatter}`);
  }
  if (signals.linter) {
    commands.push(`Linter: ${signals.linter}`);
  }
  if (signals.tests) {
    commands.push(`Tests: ${signals.tests}`);
  }
  if (signals.build) {
    commands.push(`Build: ${signals.build}`);
  }
  return commands;
}

export async function prepareLocalChange(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    const input: PrepareLocalChangeInput = prepareLocalChangeSchema.parse(args);

    context.logger.info(`Preparing local change for task: ${input.task}`);

    const signals = await discoverRepoSignals();
    const commands = toCommandList(signals);

    const suggestedPlan = [
      'Summarize the requested change and desired outcome.',
      'Call `evaluate_change` with this summary (include repository, files, risk) to assess flag requirements.',
      'Identify candidate files/components to touch and inspect existing flag coverage.',
      'Draft the smallest diff guarded by the relevant feature flag.',
      'Run formatter, linter, and tests before finalizing the change.',
    ];

    const nextTools = [
      {
        name: 'evaluate_change',
        reason: 'Score risk, detect parent flags, and decide whether to create or reuse a flag prior to editing files.',
      },
      {
        name: 'create_flag',
        reason: 'Create the feature flag if the evaluation recommends introducing one.',
      },
      {
        name: 'wrap_change',
        reason: 'Collect language-specific snippets to wrap the implementation safely.',
      },
    ];

    const textSections = [
      `# Local Change Preparation`,
      '',
      `**Task**: ${input.task}`,
      '',
      input.hints && input.hints.length > 0
        ? `**Hints**: ${input.hints.map(hint => `\`${hint}\``).join(', ')}`
        : undefined,
      '',
      '## Recommended Flow',
      '',
      '1. Use this output to understand repo guardrails before editing files.',
      '2. Call `evaluate_change` with this task summary to plan flag usage.',
      '3. Review `unleash://guides/local-change-checklist` and `unleash://workspace/summary` for conventions.',
      '4. Inspect existing flag usage around candidate files before drafting changes.',
      '5. Apply the smallest safe diff, guarded by the recommended flag, and run local checks.',
      '',
      commands.length > 0 ? '## Repository Commands' : undefined,
      commands.length > 0 ? commands.map(command => `- ${command}`).join('\n') : undefined,
      '',
      '## Next Tools',
      '',
      nextTools.map(tool => `- **${tool.name}**: ${tool.reason}`).join('\n'),
    ].filter((section): section is string => Boolean(section));

    const structuredContent = {
      success: true,
      task: input.task,
      hints: input.hints ?? [],
      plan: suggestedPlan,
      repoCommands: signals,
      nextTools,
      resources: [
        'unleash://workspace/summary',
        'unleash://guides/local-change-checklist',
        'unleash://guides/feature-development-workflow',
      ],
      nextActions: nextTools.map(tool => tool.name),
      impactedFiles: input.hints ?? [],
    };

    return {
      content: [
        {
          type: 'text',
          text: textSections.join('\n'),
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'prepare_local_change');
  }
}

export const prepareLocalChangeTool = {
  name: 'prepare_local_change',
  description:
    'Gather local guardrails in this repository before editing files. Returns repository commands, next actions, and guardrails for the local workflow.',
  annotations: {
    title: '01 Prepare Local Change',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Summary of the requested change or refactor.',
      },
      hints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional hints such as suspected file paths or components involved.',
      },
    },
    required: ['task'],
  },
};
