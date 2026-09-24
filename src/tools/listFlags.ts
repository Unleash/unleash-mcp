import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import { readFeatureFlagsResource } from '../resources/unleashResources.js';
import {
  DEFAULT_FEATURE_FLAG_PAGE_SIZE,
  type FeatureFlagSummary,
  MAX_FEATURE_FLAG_PAGE_SIZE,
} from '../unleash/client.js';

export const listFlagsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID to list flags from (optional if UNLEASH_DEFAULT_PROJECT is set; auto-resolved when a single project exists)',
    ),
  archived: z
    .boolean()
    .default(false)
    .describe(
      'Set to true to list archived flags instead of active ones. Defaults to false (active flags only). Active and archived flags cannot be returned in the same response — call this tool twice (once with archived=false, once with archived=true) to assemble a full inventory for audit workflows.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_FEATURE_FLAG_PAGE_SIZE)
    .default(DEFAULT_FEATURE_FLAG_PAGE_SIZE)
    .describe(
      `Page size: number of flags returned per call (default ${DEFAULT_FEATURE_FLAG_PAGE_SIZE}, maximum ${MAX_FEATURE_FLAG_PAGE_SIZE}). Larger values are rejected; the tool never returns more than ${MAX_FEATURE_FLAG_PAGE_SIZE} flags at once.`,
    ),
  order: z.enum(['asc', 'desc']).default('asc').describe('Sort order by flag name (default: asc)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe(
      'Number of flags to skip before the returned page (default: 0). Pass the nextOffset from the previous response to fetch the following page.',
    ),
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

function pluralizeFlags(count: number): string {
  return `${count} flag${count === 1 ? '' : 's'}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
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

    const filterLabel = input.archived ? 'archived' : 'active';

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
      archived: input.archived,
    });
    const envelope = JSON.parse(resource.text) as FeatureFlagsEnvelope;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Listed ${envelope.flags.length} of ${envelope.totalFlags} ${filterLabel} flag${envelope.totalFlags === 1 ? '' : 's'}`,
    );

    const paginationHint =
      envelope.nextOffset !== undefined
        ? ` More pages available: call again with offset=${envelope.nextOffset} only if the task needs flags beyond this page.`
        : ' This is the last page.';

    const flagLines =
      envelope.flags.length > 0
        ? envelope.flags.map((flag) => {
            const typeLabel = flag.type ?? 'unknown';
            const descriptionSuffix = flag.description ? ` — ${flag.description}` : '';
            return `- ${flag.name} (${typeLabel})${descriptionSuffix}`;
          })
        : [`- No ${filterLabel} flags found on this page.`];

    const counterpartHint = input.archived
      ? ' Call again with archived=false (or omit the parameter) to see active flags.'
      : ' Call again with archived=true to see archived flags.';

    const summaryText = [
      `Project "${projectId}" — ${pluralizeFlags(envelope.totalFlags)} ${filterLabel} in total.`,
      `Showing ${envelope.flags.length} (offset=${envelope.offset}, limit=${envelope.limit}, order=${envelope.order}).${paginationHint}`,
      `(Filter: archived=${envelope.archived}.${counterpartHint})`,
      '',
      `${capitalize(filterLabel)} flags:`,
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
          title: `${capitalize(filterLabel)} feature flags in project ${projectId}`,
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
  title: 'List feature flags',
  annotations: { readOnlyHint: true },
  description: `List feature flags in an Unleash project, one page at a time. Results are paginated server-side: each call returns at most one page of ${MAX_FEATURE_FLAG_PAGE_SIZE} flags (default ${DEFAULT_FEATURE_FLAG_PAGE_SIZE}), sorted by name, together with totalFlags and a nextOffset when more pages exist. Work page by page: inspect the current page first and request the next page (offset=nextOffset) only when the task actually needs flags beyond it. Do not eagerly fetch every page up front — large projects can hold thousands of flags. By default returns active flags only; set archived=true to list archived flags instead (active and archived flags are disjoint result sets in Unleash and cannot be combined in one response). Use this to discover flags before creating new ones, audit flag inventory for cleanup (call twice — once for active, once for archived), or scope a workflow to a specific project. Returns name, type, description, archived status, and URL for each flag.`,
  inputSchema: listFlagsSchema,
  implementation: listFlags,
};
