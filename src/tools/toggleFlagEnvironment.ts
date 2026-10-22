import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askToFindFlagProject,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import type { FeatureDetails, FeatureEnvironment } from '../unleash/client.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';
import {
  alreadyWaiting,
  approvalEnvironments,
  findApprovalEnvironment,
  findWaiting,
  type PendingApproval,
  requestChange,
  withdraw,
  withWaitingChanges,
} from './changeRequests.js';

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

    const { url, resourceUri } = createFlagLinks(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const approvalEnvironment = findApprovalEnvironment(
      await approvalEnvironments(context, projectId),
      input.environment,
    );
    let feature: FeatureDetails;
    if (approvalEnvironment) {
      const [current, open] = await Promise.all([
        context.unleashClient.getFeature(projectId, input.featureName),
        context.unleashClient.openChangeRequests(projectId),
      ]);
      feature = current;
      const live = findEnvironmentState(feature, input.environment);
      const waiting = findWaiting(open, approvalEnvironment, input.featureName);
      const enabledOnceApplied = live && withWaitingChanges(live, waiting.changes).enabled;
      const reply = {
        success: true,
        projectId,
        featureName: input.featureName,
        environment: input.environment,
        enabled: live?.enabled ?? false,
        links: { ui: url, resourceUri },
      };
      const waitingToggle = waiting.changes.find(
        (change) => change.action === 'updateEnabled' && change.payload.enabled !== input.enabled,
      );
      if (waiting.changeRequest && waitingToggle && live?.enabled === input.enabled) {
        const withdrawn = await withdraw(context, projectId, waiting.changeRequest, [
          waitingToggle.id,
        ]);
        return jsonResult({
          ...reply,
          outcome: 'saved',
          changeRequest: withdrawn.changeRequest,
          notes: [
            `It is already ${input.enabled ? 'on' : 'off'}, so the waiting change to turn it ${input.enabled ? 'off' : 'on'} was taken back. ${withdrawn.note}`,
          ],
        });
      }
      if (enabledOnceApplied !== input.enabled) {
        const pending: PendingApproval<{ enabled: boolean }> = {
          outcome: 'pendingApproval',
          requested: { enabled: input.enabled },
          ...(await requestChange(
            context,
            projectId,
            approvalEnvironment,
            input.featureName,
            waiting,
            [{ action: 'updateEnabled', payload: { enabled: input.enabled } }],
          )),
        };
        return jsonResult({ ...reply, ...pending });
      }
      if (waiting.changeRequest && live?.enabled !== input.enabled) {
        const pending = alreadyWaiting(
          context,
          projectId,
          waiting.changeRequest,
          { enabled: input.enabled },
          `turns it ${input.enabled ? 'on' : 'off'}`,
        );
        return jsonResult({ ...reply, ...pending });
      }
    } else {
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

      feature = await context.unleashClient.getFeature(projectId, input.featureName);
    }

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `${input.enabled ? 'Enabled' : 'Disabled'} "${input.featureName}" in "${input.environment}"`,
    );

    const apiBase = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment,
    )}`;
    const apiUrl = `${apiBase}/${input.enabled ? 'on' : 'off'}`;

    const environmentState = findEnvironmentState(feature, input.environment) ?? null;

    return jsonResult({
      outcome: 'saved',
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

function findEnvironmentState(
  feature: FeatureDetails,
  environment: string,
): FeatureEnvironment | undefined {
  const target = environment.toLowerCase();
  return feature.environments?.find(
    (env) => env.environment?.toLowerCase() === target || env.name.toLowerCase() === target,
  );
}

export const toggleFlagEnvironmentTool = {
  name: 'toggle_flag_environment',
  title: 'Toggle flag in environment',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description:
    'Enable or disable a feature flag in a specific environment using the Unleash Admin API. For gradual rollouts, configure a flexibleRollout strategy first via set_flag_rollout. ' +
    'In an environment where your changes need approval, the change goes into a change request instead and the result has outcome "pendingApproval" with a link to the change request; nothing changes until it is approved and applied. Asking for what is live now takes back your waiting change instead, with outcome "saved".',
  inputSchema: toggleFlagEnvironmentSchema,
  implementation: toggleFlagEnvironment,
};
