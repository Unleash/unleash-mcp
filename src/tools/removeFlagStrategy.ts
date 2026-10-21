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
import { refusedForApproval, requestApproval, waitingForApprovalNote } from './changeRequests.js';

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

    try {
      await context.unleashClient.deleteFeatureStrategy(
        projectId,
        input.featureName,
        input.environment,
        input.strategyId,
      );
    } catch (error) {
      if (!refusedForApproval(error)) throw error;
      // Unleash refuses before it looks the strategy up, so a wrong ID would still go for review.
      const { environments = [] } = await context.unleashClient.getFeature(
        projectId,
        input.featureName,
      );
      const strategies = environments.find((env) => env.name === input.environment)?.strategies;
      if (!strategies?.some((strategy) => strategy.id === input.strategyId)) {
        throw new CustomError(
          'STRATEGY_NOT_FOUND',
          `"${input.environment}" has no strategy with ID ${input.strategyId}.`,
          'Call get_flag_state to find the strategy IDs.',
        );
      }
      const pendingApproval = await requestApproval(
        context,
        projectId,
        input.environment,
        input.featureName,
        [{ action: 'deleteStrategy', payload: { id: input.strategyId } }],
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

    const { url, resourceUri } = createFlagLinks(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment,
    )}/strategies/${encodeURIComponent(input.strategyId)}`;

    return jsonResult({
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
    'In an environment that only takes approved changes, the removal goes into a change request sent for review instead, and pendingApproval links to it.',
  inputSchema: removeFlagStrategySchema,
  implementation: removeFlagStrategy,
};
