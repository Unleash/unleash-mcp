import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askToFindFlagProject,
  handleToolError,
  resolveProjectId,
  type ServerContext,
  toolErrorPayload,
} from '../context.js';
import type { FeatureDetails, FeatureEnvironment, Segment } from '../unleash/client.js';
import type { NormalizedError } from '../utils/errors.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';

const getFlagStateSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set; search_flags finds it from the flag name)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().optional().describe('Optional environment filter (case-insensitive)'),
  includeSegments: z
    .boolean()
    .optional()
    .describe(
      'Also return the segments the strategies use, with the constraints that decide who each one includes. Set it when you need to know who a strategy targets.',
    ),
  includeParentOptions: z
    .boolean()
    .optional()
    .describe(
      "Also return parentOptions: names of active flags in this project that could become this flag's parent (flags that already depend on another flag are excluded). Unleash allows one parent per flag, so a parent can only be added when feature.dependencies and feature.children are both empty. The current parent, if any, is always returned in feature.dependencies.",
    ),
  parentVariantsOf: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Also return parentVariantOptions: variant names of this parent flag that a dependency can require. Pass a name from parentOptions or from feature.dependencies.',
    ),
});

interface ParentVariantOptions {
  parent: string;
  variants: string[];
  hint?: string;
}

async function fetchParentVariantOptions(
  context: ServerContext,
  projectId: string,
  feature: FeatureDetails,
  parent: string,
  candidates: string[] | undefined,
): Promise<ParentVariantOptions> {
  const currentParent = feature.dependencies?.[0]?.feature;

  // The parent-variants endpoint returns [] for unknown flags, so check a candidate against the
  // parent list to tell "no variants" apart from "not a valid parent".
  if (parent !== currentParent) {
    const parentOptions =
      candidates ?? (await context.unleashClient.getParentFeatureOptions(projectId, feature.name));
    if (!parentOptions.includes(parent)) {
      return {
        parent,
        variants: [],
        hint: `"${parent}" is not a valid parent for "${feature.name}": it must be an active flag in project "${projectId}" that does not itself depend on another flag. Set includeParentOptions to list valid parents.`,
      };
    }
  }

  const variants = await context.unleashClient.getParentVariantOptions(projectId, parent);
  return {
    parent,
    variants,
    ...(variants.length === 0 && {
      hint: `"${parent}" has no variants. A dependency on it can only require it to be enabled or disabled.`,
    }),
  };
}

type GetFlagStateInput = z.infer<typeof getFlagStateSchema>;
type SegmentError = { id: number; error: NormalizedError };

function segmentIdsOf(environments: FeatureEnvironment[]): number[] {
  const ids = environments.flatMap((env) =>
    (env.strategies ?? []).flatMap((strategy) => strategy.segments ?? []),
  );
  return [...new Set(ids)];
}

async function fetchSegments(
  context: ServerContext,
  ids: number[],
): Promise<{ segments: Segment[]; segmentErrors: SegmentError[] }> {
  const results = await Promise.allSettled(ids.map((id) => context.unleashClient.getSegment(id)));

  const segments: Segment[] = [];
  const segmentErrors: SegmentError[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      segments.push(result.value);
    } else {
      const { error } = toolErrorPayload(context, result.reason, 'get_flag_state');
      segmentErrors.push({ id: ids[index], error });
    }
  }
  return { segments, segmentErrors };
}

export async function getFlagState(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFlagStateInput = getFlagStateSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askToFindFlagProject(input.featureName);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching feature "${input.featureName}" in project "${projectId}"...`,
    );

    const [feature, parentOptions] = await Promise.all([
      context.unleashClient.getFeature(projectId, input.featureName),
      input.includeParentOptions
        ? context.unleashClient.getParentFeatureOptions(projectId, input.featureName)
        : Promise.resolve(undefined),
    ]);

    const parentVariantOptions = input.parentVariantsOf
      ? await fetchParentVariantOptions(
          context,
          projectId,
          feature,
          input.parentVariantsOf,
          parentOptions,
        )
      : undefined;

    let environments = feature.environments ?? [];

    if (input.environment) {
      environments = environments.filter(
        (env) =>
          env.environment?.toLowerCase() === input.environment?.toLowerCase() ||
          env.name.toLowerCase() === input.environment?.toLowerCase(),
      );
    }

    const segmentIds = segmentIdsOf(environments);
    const segmentDetails = input.includeSegments
      ? await fetchSegments(context, segmentIds)
      : undefined;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Fetched feature "${input.featureName}" (${environments.length} environment${environments.length === 1 ? '' : 's'} considered)`,
    );

    const { url, resourceUri } = createFlagLinks(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}`;

    context.logger.info(
      `Retrieved feature state for "${input.featureName}"${input.environment ? ` (filtered to "${input.environment}")` : ''}`,
    );

    return jsonResult({
      success: true,
      projectId,
      featureName: feature.name,
      environmentFilter: input.environment,
      feature: feature as FeatureDetails,
      environments,
      ...segmentDetails,
      ...(!input.includeSegments &&
        segmentIds.length > 0 && {
          hint: `Strategies use segments ${segmentIds.join(', ')}. Call again with includeSegments: true to see who they target.`,
        }),
      ...(parentOptions !== undefined && { parentOptions }),
      ...(parentVariantOptions !== undefined && { parentVariantOptions }),
      links: {
        ui: url,
        api: apiUrl,
        resourceUri,
      },
    });
  } catch (error) {
    return handleToolError(context, error, 'get_flag_state');
  }
}

export const getFlagStateTool = {
  name: 'get_flag_state',
  title: 'Get flag state',
  annotations: { readOnlyHint: true },
  description:
    'Fetch the current feature flag metadata, environment strategies and parent dependencies from the Unleash Admin API. Strategies list their segments by ID; set includeSegments to also get what each segment targets. Set includeParentOptions to list flags this flag could depend on, and parentVariantsOf to list the variants a dependency on that parent can require.',
  inputSchema: getFlagStateSchema,
  implementation: getFlagState,
};
