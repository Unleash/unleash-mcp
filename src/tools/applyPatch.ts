import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, handleToolError } from '../context.js';

const applyPatchSchema = z.object({
  patch: z.string().min(1, 'patch is required').describe('Unified diff to apply in this workspace'),
});

type ApplyPatchInput = z.infer<typeof applyPatchSchema>;

function extractFiles(patch: string): string[] {
  const files = new Set<string>();
  const diffHeader = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = diffHeader.exec(patch)) !== null) {
    files.add(match[2]);
  }
  const plusPlus = /^\+\+\+ b\/(.+)$/gm;
  while ((match = plusPlus.exec(patch)) !== null) {
    files.add(match[1]);
  }
  const minusMinus = /^--- a\/(.+)$/gm;
  while ((match = minusMinus.exec(patch)) !== null) {
    files.add(match[1]);
  }
  return Array.from(files);
}

function countHunks(patch: string): number {
  const hunks = patch.match(/^@@/gm);
  return hunks ? hunks.length : 0;
}

export async function applyPatch(
  context: ServerContext,
  args: unknown
): Promise<CallToolResult> {
  try {
    const input: ApplyPatchInput = applyPatchSchema.parse(args);
    const files = extractFiles(input.patch);
    const hunks = countHunks(input.patch);

    const summaryLines = [
      '# Patch Summary (no-op)',
      '',
      'This server does not auto-apply patches. Review the summary below and apply the diff manually, then run local checks.',
      '',
      `Files referenced (${files.length}):`,
      files.length > 0 ? files.map(file => `- ${file}`).join('\n') : '- (none detected)',
      '',
      `Hunks: ${hunks}`,
    ];

    const structuredContent = {
      success: true,
      applied: false,
      files,
      hunks,
      message:
        'Patch not applied automatically. Use this summary and apply the diff with your preferred local workflow (e.g., git apply).',
    };

    return {
      content: [
        {
          type: 'text',
          text: summaryLines.join('\n'),
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'apply_patch');
  }
}

export const applyPatchTool = {
  name: 'apply_patch',
  description:
    'Summarize a unified diff for this repository. Returns impacted files and hunk counts so you can apply it locally.',
  annotations: {
    title: 'Apply Patch Summary',
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: 'object',
    properties: {
      patch: {
        type: 'string',
        description: 'Unified diff generated from this workspace.',
      },
    },
    required: ['patch'],
  },
};
