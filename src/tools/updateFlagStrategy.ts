import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import type { UpdateFeatureStrategyOptions } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlagResourceLink } from '../utils/streaming.js';
import { constraintSchema, toStrategyVariants, variantSchema } from './strategySchemas.js';

const updateFlagStrategySchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Environment the strategy belongs to'),
  strategyId: z
    .string()
    .min(1)
    .describe('ID of the strategy to update (find it with get_flag_state)'),
  rolloutPercentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('New rollout percentage (0-100)'),
  groupId: z.string().optional().describe('New group ID for stickiness bucketing'),
  stickiness: z.string().optional().describe('New stickiness field'),
  title: z.string().optional().describe('New descriptive title for the strategy'),
  disabled: z.boolean().optional().describe('Enable or disable the strategy'),
  variants: z
    .array(variantSchema)
    .optional()
    .describe('Replacement list of strategy-level variants'),
  constraints: z
    .array(constraintSchema)
    .optional()
    .describe('Replacement list of constraints. Pass an empty array to clear all constraints.'),
});

type UpdateFlagStrategyInput = z.infer<typeof updateFlagStrategySchema>;

/**
 * Collect the fields the caller actually wants to change. Anything omitted is
 * left alone so the client can merge it with the strategy's current state.
 */
function collectUpdates(input: UpdateFlagStrategyInput): UpdateFeatureStrategyOptions {
  return {
    ...(input.rolloutPercentage !== undefined
      ? { rolloutPercentage: input.rolloutPercentage }
      : {}),
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.stickiness !== undefined ? { stickiness: input.stickiness } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
    ...(input.variants !== undefined ? { variants: toStrategyVariants(input.variants) } : {}),
    ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
  };
}

export async function updateFlagStrategy(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: UpdateFlagStrategyInput = updateFlagStrategySchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    const updates = collectUpdates(input);
    const updatedFields = Object.keys(updates);

    if (updatedFields.length === 0) {
      throw new CustomError(
        'VALIDATION_ERROR',
        'No changes were requested for the strategy',
        'Provide at least one of: rolloutPercentage, groupId, stickiness, title, disabled, variants or constraints.',
      );
    }

    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${mode}Updating strategy "${input.strategyId}" for "${input.featureName}" in "${input.environment}"...`,
    );

    const strategy = await context.unleashClient.updateFeatureStrategy(
      projectId,
      input.featureName,
      input.environment,
      input.strategyId,
      updates,
    );

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `${mode}Strategy "${input.strategyId}" updated`,
    );

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment,
    )}/strategies/${encodeURIComponent(input.strategyId)}`;

    const message = `${mode}Updated strategy "${input.strategyId}" for "${input.featureName}" in "${input.environment}" (${updatedFields.join(', ')}).`;

    context.logger.info(message);

    return {
      content: [
        {
          type: 'text',
          text: `${message}\nView feature: ${url}\nAdmin API: ${apiUrl}`,
        },
        {
          type: 'resource_link',
          name: input.featureName,
          uri: resource.uri,
          mimeType: resource.mimeType,
          title: resource.text,
        },
      ],
      structuredContent: {
        success: true,
        dryRun: context.config.server.dryRun,
        projectId,
        featureName: input.featureName,
        environment: input.environment,
        strategyId: input.strategyId,
        updatedFields,
        strategy,
        links: {
          ui: url,
          api: apiUrl,
          resourceUri: resource.uri,
        },
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'update_flag_strategy');
  }
}

export const updateFlagStrategyTool = {
  name: 'update_flag_strategy',
  title: 'Update flag strategy',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description: `Update an existing strategy of a feature flag environment in place, without creating a new one.

Use this to change a strategy's constraints, rollout percentage, stickiness, title, variants, or to disable it. Fields you omit keep their current value; pass an empty \`constraints\` array to clear all constraints.

Find the \`strategyId\` with get_flag_state. Use set_flag_rollout instead when the environment has no strategy yet.

Constraints gate when the strategy applies, e.g. \`webVersion NUM_GTE 1.42.0\` so a 100% rollout only reaches clients that already ship the code.`,
  inputSchema: updateFlagStrategySchema,
  implementation: updateFlagStrategy,
};
