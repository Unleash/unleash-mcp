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
  archived: z
    .boolean()
    .optional()
    .describe(
      'Set to true to list archived flags instead of active ones. Defaults to false (active flags only). Active and archived flags cannot be returned in the same response — call this tool twice (once with archived=false, once with archived=true) to assemble a full inventory for audit workflows.',
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
  archived: boolean;
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

    const archivedRequested = input.archived === true;
    const filterLabel = archivedRequested ? 'archived' : 'active';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Listing ${filterLabel} feature flags in project "${projectId}"...`,
    );

    const resource = await readFeatureFlagsResource(context, projectId, {
      limit: input.limit,
      order: input.order,
      offset: input.offset,
      archived: archivedRequested,
    });
    const envelope = JSON.parse(resource.text) as FeatureFlagsEnvelope;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Listed ${envelope.flags.length} of ${envelope.totalFlags} ${filterLabel} flag${envelope.totalFlags === 1 ? '' : 's'}`,
    );

    const paginationHint =
      envelope.nextOffset != null
        ? `, nextOffset=${envelope.nextOffset} (call again with offset=${envelope.nextOffset} for the next page)`
        : '';

    const flagLines =
      envelope.flags.length > 0
        ? envelope.flags.map((f) => {
            const typeLabel = f.type ?? 'unknown';
            const descriptionSuffix = f.description ? ` — ${f.description}` : '';
            return `- ${f.name} (${typeLabel})${descriptionSuffix}`;
          })
        : [`- No ${filterLabel} flags found.`];

    const counterpartHint = archivedRequested
      ? ' Call again with archived=false (or omit the parameter) to see active flags.'
      : ' Call again with archived=true to see archived flags.';

    const summaryText = [
      `Project "${projectId}" — ${envelope.totalFlags} ${filterLabel} flag${envelope.totalFlags === 1 ? '' : 's'} total.`,
      `Showing ${envelope.flags.length}; order=${envelope.order}, offset=${envelope.offset}${paginationHint}.`,
      `(Filter: archived=${envelope.archived}.${counterpartHint})`,
      '',
      `${filterLabel.charAt(0).toUpperCase()}${filterLabel.slice(1)} flags:`,
      ...flagLines,
    ].join('\n');

    context.logger.info(
      `Listed ${envelope.flags.length}/${envelope.totalFlags} ${filterLabel} feature flag(s) in project "${projectId}"`,
    );

    return {
      content: [
        {
          type: 'text',
          text: summaryText,
        },
        {
          type: 'resource_link',
          name: `feature-flags-${projectId}-${filterLabel}`,
          uri: resource.uri,
          mimeType: resource.mimeType ?? 'application/json',
          title: `${filterLabel.charAt(0).toUpperCase()}${filterLabel.slice(1)} feature flags in project ${projectId}`,
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
    'List feature flags in an Unleash project, with optional pagination and sort order. By default returns active flags only; set archived=true to list archived flags instead (active and archived flags are disjoint result sets in Unleash and cannot be combined in one response). Use this to discover flags before creating new ones, audit flag inventory for cleanup (call twice — once for active, once for archived), or scope a workflow to a specific project. Returns name, type, description, archived status, and URL for each flag.',
  inputSchema: listFlagsSchema,
  implementation: listFlags,
};
