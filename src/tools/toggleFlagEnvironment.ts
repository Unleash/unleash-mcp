import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ensureProjectId, handleToolError, type ServerContext } from '../context.js';
import type { FeatureDetails } from '../unleash/client.js';
import { createFlagResourceLink, notifyProgress } from '../utils/streaming.js';

const toggleFlagEnvironmentSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Environment to toggle'),
  enabled: z.boolean().describe('Set to true to enable the flag, or false to disable it'),
});

type ToggleFlagEnvironmentInput = z.infer<typeof toggleFlagEnvironmentSchema>;

export async function toggleFlagEnvironment(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: ToggleFlagEnvironmentInput = toggleFlagEnvironmentSchema.parse(args);

    const projectId = ensureProjectId(input.projectId, context.config.unleash.defaultProject);
    const action = input.enabled ? 'Enabling' : 'Disabling';

    await notifyProgress(
      context.server,
      progressToken,
      0,
      100,
      `${action} "${input.featureName}" in "${input.environment}"...`,
    );

    const feature: FeatureDetails = await context.unleashClient.toggleFeatureEnvironment(
      projectId,
      input.featureName,
      input.environment,
      input.enabled,
    );

    await notifyProgress(
      context.server,
      progressToken,
      100,
      100,
      `${input.enabled ? 'Enabled' : 'Disabled'} "${input.featureName}" in "${input.environment}"`,
    );

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const apiBase = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment,
    )}`;
    const apiUrl = `${apiBase}/${input.enabled ? 'on' : 'off'}`;

    const environmentState =
      feature.environments?.find((env) => {
        const target = input.environment.toLowerCase();
        return env.environment?.toLowerCase() === target || env.name.toLowerCase() === target;
      }) ?? null;

    const messageLines = [
      `${input.enabled ? 'Enabled' : 'Disabled'} "${input.featureName}" in "${input.environment}".`,
      environmentState
        ? `Environment state: ${environmentState.enabled ? 'enabled' : 'disabled'} • Strategies: ${
            environmentState.strategies?.length ?? 0
          }`
        : 'Environment state could not be located in the response.',
      `View feature: ${url}`,
      `Admin API: ${apiUrl}`,
    ];

    const structuredContent = {
      success: true,
      dryRun: context.config.server.dryRun,
      projectId,
      featureName: feature.name,
      environment: input.environment,
      enabled: environmentState?.enabled ?? input.enabled,
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
          title: resource.text,
        },
      ],
      structuredContent,
    };
  } catch (error) {
    return handleToolError(context, error, 'toggle_flag_environment');
  }
}

export const toggleFlagEnvironmentTool = {
  name: 'toggle_flag_environment',
  description:
    'Enable or disable a feature flag in a specific environment using the Unleash Admin API. For gradual rollouts, configure a flexibleRollout strategy first via set_flag_rollout.',
  inputSchema: toggleFlagEnvironmentSchema,
  implementation: toggleFlagEnvironment,
};
