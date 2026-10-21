import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askToFindFlagProject,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';
import { refusedForApproval, requestApproval, waitingForApprovalNote } from './changeRequests.js';

const toggleFlagEnvironmentSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set; search_flags finds it from the flag name)',
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

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askToFindFlagProject(input.featureName);
    const action = input.enabled ? 'Enabling' : 'Disabling';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${action} "${input.featureName}" in "${input.environment}"...`,
    );

    try {
      await context.unleashClient.toggleFeatureEnvironment(
        projectId,
        input.featureName,
        input.environment,
        input.enabled,
      );
    } catch (error) {
      if (!refusedForApproval(error)) throw error;
      // Unleash also refuses a toggle to the state the environment already has.
      const { environments = [] } = await context.unleashClient.getFeature(
        projectId,
        input.featureName,
      );
      const current = environments.find((env) => env.name === input.environment);
      if (current?.enabled !== input.enabled) {
        const pendingApproval = await requestApproval(
          context,
          projectId,
          input.environment,
          input.featureName,
          [{ action: 'updateEnabled', payload: { enabled: input.enabled } }],
        );
        return jsonResult({
          success: true,
          projectId,
          featureName: input.featureName,
          environment: input.environment,
          pendingApproval,
          notes: [waitingForApprovalNote(input.environment, pendingApproval)],
        });
      }
    }

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

    const { url, resourceUri } = createFlagLinks(
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

    return jsonResult({
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
        resourceUri,
      },
    });
  } catch (error) {
    return handleToolError(context, error, 'toggle_flag_environment');
  }
}

export const toggleFlagEnvironmentTool = {
  name: 'toggle_flag_environment',
  title: 'Toggle flag in environment',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description:
    'Enable or disable a feature flag in a specific environment using the Unleash Admin API. For gradual rollouts, configure a flexibleRollout strategy first via set_flag_rollout. ' +
    'In an environment that only takes approved changes, the change goes into a change request sent for review instead, and pendingApproval links to it.',
  inputSchema: toggleFlagEnvironmentSchema,
  implementation: toggleFlagEnvironment,
};
