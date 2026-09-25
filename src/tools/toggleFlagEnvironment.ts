import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { createFlagResourceLink } from '../utils/streaming.js';

const toggleFlagEnvironmentSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe(
      'Project ID where the feature flag resides. Use the default project named in the server instructions when one is configured, otherwise pick one with list_projects; determine it once per session and reuse it.',
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

    const projectId = input.projectId;
    const action = input.enabled ? 'Enabling' : 'Disabling';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${action} "${input.featureName}" in "${input.environment}"...`,
    );

    await context.unleashClient.toggleFeatureEnvironment(
      projectId,
      input.featureName,
      input.environment,
      input.enabled,
    );

    await context.notifyProgress(
      progressToken,
      75,
      100,
      `Feature ${input.enabled ? 'Enabled' : 'Disabled'} "${input.featureName}" in "${input.environment}", validating state...`,
    );

    const feature = await context.unleashClient.getFeature(projectId, input.featureName);

    await context.notifyProgress(
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
  title: 'Toggle flag in environment',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description:
    'Enable or disable a feature flag in a specific environment using the Unleash Admin API. For gradual rollouts, configure a flexibleRollout strategy first via set_flag_rollout.',
  inputSchema: toggleFlagEnvironmentSchema,
  implementation: toggleFlagEnvironment,
};
