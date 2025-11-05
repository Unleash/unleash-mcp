import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, ensureProjectId, handleToolError } from '../context.js';
import { notifyProgress, createFlagResourceLink } from '../utils/streaming.js';
import { FeatureDetails, FeatureEnvironment } from '../unleash/client.js';

const getFlagStateSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Project ID (optional if UNLEASH_DEFAULT_PROJECT is configured)'),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z
    .string()
    .optional()
    .describe('Optional environment filter to focus on a single environment'),
});

type GetFlagStateInput = z.infer<typeof getFlagStateSchema>;

function summarizeEnvironment(env: FeatureEnvironment): string {
  const status = env.enabled ? 'enabled' : 'disabled';
  const strategyCount = env.strategies?.length ?? 0;
  const enabledStrategies = env.strategies?.filter((s) => !s.disabled).length ?? 0;
  const variants = env.variants?.length ?? 0;
  return `${env.environment ?? env.name}: ${status} (${enabledStrategies}/${strategyCount} active strategies${variants ? `, ${variants} variants` : ''})`;
}

export async function getFlagState(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number
): Promise<CallToolResult> {
  try {
    const input: GetFlagStateInput = getFlagStateSchema.parse(args);

    const projectId = ensureProjectId(input.projectId, context.config.unleash.defaultProject);

    await notifyProgress(
      context.server,
      progressToken,
      0,
      100,
      `Fetching feature "${input.featureName}" in project "${projectId}"...`
    );

    const feature = await context.unleashClient.getFeature(projectId, input.featureName);

    let environments = feature.environments ?? [];

    if (input.environment) {
      environments = environments.filter(
        (env) =>
          env.environment?.toLowerCase() === input.environment!.toLowerCase() ||
          env.name.toLowerCase() === input.environment!.toLowerCase()
      );
    }

    await notifyProgress(
      context.server,
      progressToken,
      100,
      100,
      `Fetched feature "${input.featureName}" (${environments.length} environment${environments.length === 1 ? '' : 's'} considered)`
    );

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId
    )}/features/${encodeURIComponent(input.featureName)}`;

    const environmentSummaries =
      environments.length > 0
        ? environments.map((env) => `- ${summarizeEnvironment(env)}`).join('\n')
        : '- No environments matched the provided filters.';

    const messageLines = [
      `Feature "${feature.name}" (${feature.type ?? 'unknown type'})`,
      `Enabled: ${feature.enabled ? 'yes' : 'no'} • Archived: ${feature.archived ? 'yes' : 'no'} • Impression data: ${feature.impressionData ? 'on' : 'off'}`,
      `Project: ${feature.project ?? projectId}`,
      `Environments:\n${environmentSummaries}`,
      `View feature: ${url}`,
      `Admin API: ${apiUrl}`,
    ];

    const summaryText = messageLines.join('\n');

    context.logger.info(
      `Retrieved feature state for "${input.featureName}"${input.environment ? ` (filtered to "${input.environment}")` : ''}`
    );

    const structuredContent = {
      success: true,
      projectId,
      featureName: feature.name,
      environmentFilter: input.environment,
      feature: feature as FeatureDetails,
      environments,
      links: {
        ui: url,
        api: apiUrl,
        resourceUri: resource.uri,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: summaryText,
        },
        {
          type: 'resource_link',
          name: feature.name,
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.text,
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'get_flag_state');
  }
}

export const getFlagStateTool = {
  name: 'get_flag_state',
  description:
    'Fetch the current feature flag metadata and environment strategies from the Unleash Admin API.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description:
          'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
      },
      featureName: {
        type: 'string',
        description: 'Feature flag name',
      },
      environment: {
        type: 'string',
        description: 'Optional environment filter (case-insensitive)',
      },
    },
    required: ['featureName'],
  },
};
