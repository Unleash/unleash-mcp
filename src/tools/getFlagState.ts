import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import type { FeatureDetails } from '../unleash/client.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';

const getFlagStateSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().optional().describe('Optional environment filter (case-insensitive)'),
});

type GetFlagStateInput = z.infer<typeof getFlagStateSchema>;

export async function getFlagState(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: GetFlagStateInput = getFlagStateSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Fetching feature "${input.featureName}" in project "${projectId}"...`,
    );

    const feature = await context.unleashClient.getFeature(projectId, input.featureName);

    let environments = feature.environments ?? [];

    if (input.environment) {
      environments = environments.filter(
        (env) =>
          env.environment?.toLowerCase() === input.environment?.toLowerCase() ||
          env.name.toLowerCase() === input.environment?.toLowerCase(),
      );
    }

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
    'Fetch the current feature flag metadata and environment strategies from the Unleash Admin API.',
  inputSchema: getFlagStateSchema,
  implementation: getFlagState,
};
