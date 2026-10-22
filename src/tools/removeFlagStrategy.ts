import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askToFindFlagProject,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import type { FeatureDetails } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';
import {
  alreadyWaiting,
  approvalEnvironments,
  findApprovalEnvironment,
  findWaiting,
  type PendingApproval,
  requestChange,
} from './changeRequests.js';

const removeFlagStrategySchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set; search_flags finds it from the flag name)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Environment from which to remove the strategy'),
  strategyId: z.string().min(1).describe('ID of the strategy to remove'),
});

type RemoveFlagStrategyInput = z.infer<typeof removeFlagStrategySchema>;

export async function removeFlagStrategy(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: RemoveFlagStrategyInput = removeFlagStrategySchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askToFindFlagProject(input.featureName);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Removing strategy "${input.strategyId}" from "${input.featureName}" in "${input.environment}"...`,
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
    if (approvalEnvironment) {
      const [{ environments = [] }, open] = await Promise.all([
        context.unleashClient.getFeature(projectId, input.featureName),
        context.unleashClient.openChangeRequests(projectId),
      ]);
      const strategies = environments.find(
        (env) => env.name.toLowerCase() === input.environment.toLowerCase(),
      )?.strategies;
      if (!strategies?.some((strategy) => strategy.id === input.strategyId)) {
        throw new CustomError(
          'STRATEGY_NOT_FOUND',
          `"${input.environment}" has no strategy with ID ${input.strategyId}.`,
          'Call get_flag_state to find the strategy IDs.',
        );
      }
      const waiting = findWaiting(open, approvalEnvironment, input.featureName);
      const alreadyRemoving = waiting.changes.some(
        (change) => change.action === 'deleteStrategy' && change.payload.id === input.strategyId,
      );
      const pending: PendingApproval<{ removeStrategyId: string }> =
        waiting.changeRequest && alreadyRemoving
          ? alreadyWaiting(
              context,
              projectId,
              waiting.changeRequest,
              { removeStrategyId: input.strategyId },
              'removes it',
            )
          : {
              outcome: 'pendingApproval',
              requested: { removeStrategyId: input.strategyId },
              ...(await requestChange(
                context,
                projectId,
                approvalEnvironment,
                input.featureName,
                waiting,
                [{ action: 'deleteStrategy', payload: { id: input.strategyId } }],
              )),
            };
      return jsonResult({
        success: true,
        projectId,
        featureName: input.featureName,
        environment: input.environment,
        ...pending,
        links: { ui: url, resourceUri },
      });
    }

    await context.unleashClient.deleteFeatureStrategy(
      projectId,
      input.featureName,
      input.environment,
      input.strategyId,
    );

    const feature: FeatureDetails = await context.unleashClient.getFeature(
      projectId,
      input.featureName,
    );

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Removed strategy "${input.strategyId}" from "${input.featureName}" in "${input.environment}".`,
    );

    const matchingEnvironment =
      feature.environments?.find((env) => {
        const target = input.environment.toLowerCase();
        return env.environment?.toLowerCase() === target || env.name.toLowerCase() === target;
      }) ?? null;

    const remainingStrategies = matchingEnvironment?.strategies?.length ?? 0;

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment,
    )}/strategies/${encodeURIComponent(input.strategyId)}`;

    return jsonResult({
      outcome: 'saved',
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
        resourceUri,
      },
    });
  } catch (error) {
    return handleToolError(context, error, 'remove_flag_strategy');
  }
}

export const removeFlagStrategyTool = {
  name: 'remove_flag_strategy',
  title: 'Remove flag strategy',
  annotations: { readOnlyHint: false, destructiveHint: true },
  description:
    'Delete a strategy configuration from a feature flag environment. Use get_flag_state to discover strategy IDs before removal. ' +
    'In an environment where your changes need approval, the removal goes into a change request instead and the result has outcome "pendingApproval" with a link to the change request; the strategy stays until it is approved and applied.',
  inputSchema: removeFlagStrategySchema,
  implementation: removeFlagStrategy,
};
