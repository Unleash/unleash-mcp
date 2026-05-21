import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import { readFeatureFlagsResource } from '../resources/unleashResources.js';
import type { FeatureFlagSummary } from '../unleash/client.js';

const listFlagsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID to list flags from (optional if UNLEASH_DEFAULT_PROJECT is set; auto-resolved when a single project exists)',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Maximum number of flags to return per page (default: server page size, typically 50)',
    ),
  order: z.enum(['asc', 'desc']).optional().describe('Sort order by flag name (default: asc)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of flags to skip for pagination (default: 0)'),
});

type ListFlagsInput = z.infer<typeof listFlagsSchema>;

interface FeatureFlagsEnvelope {
  fetchedAt: string;
  cached: boolean;
  dryRun: boolean;
  projectId: string;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
  nextOffset?: number;
  totalFlags: number;
  flags: FeatureFlagSummary[];
}

export async function listFlags(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: ListFlagsInput = listFlagsSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Listing feature flags in project "${projectId}"...`,
    );

    const resource = await readFeatureFlagsResource(context, projectId, {
      limit: input.limit,
      order: input.order,
      offset: input.offset,
    });
    const envelope = JSON.parse(resource.text) as FeatureFlagsEnvelope;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Listed ${envelope.flags.length} of ${envelope.totalFlags} flag${envelope.totalFlags === 1 ? '' : 's'}`,
    );

    const activeCount = envelope.flags.filter((f) => !f.archived).length;
    const archivedCount = envelope.flags.length - activeCount;
    const paginationHint =
      envelope.nextOffset != null
        ? `, nextOffset=${envelope.nextOffset} (call again with offset=${envelope.nextOffset} for the next page)`
        : '';

    const flagLines =
      envelope.flags.length > 0
        ? envelope.flags.map((f) => {
            const typeLabel = f.type ?? 'unknown';
            const archivedLabel = f.archived ? ', archived' : '';
            const descriptionSuffix = f.description ? ` — ${f.description}` : '';
            return `- ${f.name} (${typeLabel}${archivedLabel})${descriptionSuffix}`;
          })
        : ['- No flags found.'];

    const summaryText = [
      `Project "${projectId}": ${envelope.totalFlags} flag${envelope.totalFlags === 1 ? '' : 's'} total.`,
      `Showing ${envelope.flags.length} (active: ${activeCount}, archived: ${archivedCount}); order=${envelope.order}, offset=${envelope.offset}${paginationHint}.`,
      '',
      'Flags:',
      ...flagLines,
    ].join('\n');

    context.logger.info(
      `Listed ${envelope.flags.length}/${envelope.totalFlags} feature flag(s) in project "${projectId}"`,
    );

    return {
      content: [
        {
          type: 'text',
          text: summaryText,
        },
        {
          type: 'resource_link',
          name: `feature-flags-${projectId}`,
          uri: resource.uri,
          mimeType: resource.mimeType ?? 'application/json',
          title: `Feature flags in project ${projectId}`,
        },
      ],
      structuredContent: {
        success: true,
        ...envelope,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'list_flags');
  }
}

export const listFlagsTool = {
  name: 'list_flags',
  description:
    'List all feature flags in an Unleash project, with optional pagination and sort order. Use this to discover flags before creating new ones, audit flag inventory for cleanup, or scope a workflow to a specific project. Returns name, type, description, archived status, and URL for each flag.',
  inputSchema: listFlagsSchema,
  implementation: listFlags,
};
