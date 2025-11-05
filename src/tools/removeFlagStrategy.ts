import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, ensureProjectId, handleToolError } from '../context.js';
import { notifyProgress, createFlagResourceLink } from '../utils/streaming.js';
import { FeatureDetails } from '../unleash/client.js';

const removeFlagStrategySchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)'),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Environment from which to remove the strategy'),
  strategyId: z.string().min(1).describe('ID of the strategy to remove'),
});

type RemoveFlagStrategyInput = z.infer<typeof removeFlagStrategySchema>;

export async function removeFlagStrategy(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number
): Promise<CallToolResult> {
  try {
    const input: RemoveFlagStrategyInput = removeFlagStrategySchema.parse(args);

    const projectId = ensureProjectId(input.projectId, context.config.unleash.defaultProject);

    await notifyProgress(
      context.server,
      progressToken,
      0,
      100,
      `Removing strategy "${input.strategyId}" from "${input.featureName}" in "${input.environment}"...`
    );

    await context.unleashClient.deleteFeatureStrategy(
      projectId,
      input.featureName,
      input.environment,
      input.strategyId
    );

    const feature: FeatureDetails = await context.unleashClient.getFeature(
      projectId,
      input.featureName
    );

    await notifyProgress(
      context.server,
      progressToken,
      100,
      100,
      `Removed strategy "${input.strategyId}" from "${input.featureName}" in "${input.environment}".`
    );

    const matchingEnvironment =
      feature.environments?.find((env) => {
        const target = input.environment.toLowerCase();
        return (
          env.environment?.toLowerCase() === target || env.name.toLowerCase() === target
        );
      }) ?? null;

    const remainingStrategies = matchingEnvironment?.strategies?.length ?? 0;

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment
    )}/strategies/${encodeURIComponent(input.strategyId)}`;

    const messageLines = [
      `Removed strategy "${input.strategyId}" from "${input.featureName}" in "${input.environment}".`,
      `Remaining strategies in environment: ${remainingStrategies}`,
      `View feature: ${url}`,
      `Delete endpoint (used): ${apiUrl}`,
    ];

    const structuredContent = {
      success: true,
      dryRun: context.config.server.dryRun,
      projectId,
      featureName: feature.name,
      environment: input.environment,
      removedStrategyId: input.strategyId,
      remainingStrategies,
      feature,
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
          text: messageLines.join('\n'),
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
    return handleToolError(context, error, 'remove_flag_strategy');
  }
}

export const removeFlagStrategyTool = {
  name: 'remove_flag_strategy',
  description:
    'Delete a strategy configuration from a feature flag environment. Use get_flag_state to discover strategy IDs before removal.',
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
        description: 'Environment from which to remove the strategy',
      },
      strategyId: {
        type: 'string',
        description: 'ID of the strategy to remove',
      },
    },
    required: ['featureName', 'environment', 'strategyId'],
  },
};
