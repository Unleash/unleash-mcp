import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';

const decideLocalFlowSchema = z.object({
  task: z.string().min(1, 'task is required').describe('User request or summary of the intended change'),
});

type DecideLocalFlowInput = z.infer<typeof decideLocalFlowSchema>;

const LOCAL_KEYWORDS = [
  'refactor',
  'rename',
  'update',
  'fix',
  'add',
  'delete',
  'test',
  'cleanup',
  'restructure',
  'implement',
];

const RISK_KEYWORDS = ['flag', 'feature flag', 'rollout', 'toggle', 'enable', 'disable'];

function detectLocalIntent(task: string): boolean {
  const lower = task.toLowerCase();
  return LOCAL_KEYWORDS.some(keyword => lower.includes(keyword));
}

function detectRiskIntent(task: string): boolean {
  const lower = task.toLowerCase();
  return RISK_KEYWORDS.some(keyword => lower.includes(keyword));
}

export async function decideLocalFlow(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    const input: DecideLocalFlowInput = decideLocalFlowSchema.parse(args);
    const task = input.task.trim();

    const localIntent = detectLocalIntent(task);
    const riskIntent = detectRiskIntent(task);

    const recommendation = localIntent ? 'prepare_local_change' : null;
    const nextTool = riskIntent ? 'evaluate_change' : recommendation;

    context.logger.debug('Decide local flow analysis', {
      task,
      localIntent,
      riskIntent,
      nextTool,
    });

    const reasons: string[] = [];
    if (localIntent) {
      reasons.push('Task mentions code-change verbs that usually mean editing local files.');
    } else {
      reasons.push('Did not find explicit code-change verbs; double-check before editing.');
    }
    if (riskIntent) {
      reasons.push('Mentions feature flag or rollout concepts, so run evaluate_change to plan gating.');
    }

    const structuredContent = {
      success: true,
      useLocal: localIntent,
      next: nextTool,
      reasons,
    };

    const lines: string[] = [
      '# Local Flow Recommendation',
      '',
      `Task: ${task}`,
      '',
      `Use local workflow: ${localIntent ? 'yes' : 'unclear'}`,
      `Next tool: ${nextTool ?? 'none (ask user for more detail)'}`,
      '',
      '## Reasons',
      '',
      ...reasons.map(reason => `- ${reason}`),
    ];

    return {
      content: [
        {
          type: 'text',
          text: lines.join('\n'),
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'decide_local_flow');
  }
}

export const decideLocalFlowTool = {
  name: 'decide_local_flow',
  description:
    'Decide whether a request should use the local workflow. Returns whether to start in this repository and which tool to call next.',
  annotations: {
    title: '00 Decide Local Flow',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Plain-language description of the requested change.',
      },
    },
    required: ['task'],
  },
};
