import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import { createFlagResourceLink } from '../utils/streaming.js';
import { constraintSchema, toStrategyVariants, variantSchema } from './strategySchemas.js';

const setFlagRolloutSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Target environment'),
  rolloutPercentage: z.number().min(0).max(100).describe('Rollout percentage (0-100)'),
  groupId: z
    .string()
    .optional()
    .describe('Group ID for stickiness bucketing (defaults to the feature name)'),
  stickiness: z.string().optional().describe('Stickiness field (defaults to "default")'),
  title: z.string().optional().describe('Optional descriptive title for the strategy'),
  disabled: z.boolean().optional().describe('Disable the strategy (defaults to false)'),
  variants: z.array(variantSchema).optional().describe('Optional list of strategy-level variants'),
  constraints: z
    .array(constraintSchema)
    .optional()
    .describe(
      'Optional constraints that gate the strategy. Common pattern: a 100% rollout constrained to clients at or above a released version.',
    ),
});

type SetFlagRolloutInput = z.infer<typeof setFlagRolloutSchema>;

export async function setFlagRollout(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: SetFlagRolloutInput = setFlagRolloutSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    const rolloutDisplay = `${input.rolloutPercentage}%`;
    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${mode}Configuring flexibleRollout strategy for "${input.featureName}" (${rolloutDisplay})...`,
    );

    const variants = input.variants ? toStrategyVariants(input.variants) : undefined;

    const strategy = await context.unleashClient.setFlexibleRolloutStrategy(
      projectId,
      input.featureName,
      input.environment,
      {
        rolloutPercentage: input.rolloutPercentage,
        groupId: input.groupId,
        stickiness: input.stickiness,
        title: input.title,
        disabled: input.disabled,
        variants,
        constraints: input.constraints,
      },
    );

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `${mode}Strategy configured for "${input.featureName}" in "${input.environment}"`,
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
    )}/strategies`;

    const message = context.config.server.dryRun
      ? `[DRY RUN] Would configure flexibleRollout strategy for "${input.featureName}" in "${input.environment}" at ${rolloutDisplay}.`
      : `Configured flexibleRollout strategy for "${input.featureName}" in "${input.environment}" at ${rolloutDisplay}.`;

    context.logger.info(`${message}${input.disabled ? ' Strategy is marked as disabled.' : ''}`);

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
        rolloutPercentage: input.rolloutPercentage,
        strategy,
        links: {
          ui: url,
          api: apiUrl,
          resourceUri: resource.uri,
        },
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'set_flag_rollout');
  }
}

export const setFlagRolloutTool = {
  name: 'set_flag_rollout',
  title: 'Set flag rollout strategy',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description: `Configure or update a flexibleRollout strategy for a feature flag environment with an optional rollout percentage and variants. This does NOT enable the feature; call toggle_flag_environment to turn environments on or off.

Constraints gate when the strategy applies, e.g. a 100% rollout constrained to \`webVersion NUM_GTE 1.42.0\` so the flag only turns on for clients that already ship the code.

Note: this creates a new strategy in the environment. To change an existing strategy in place (for example to adjust its constraints), use update_flag_strategy.`,
  inputSchema: setFlagRolloutSchema,
  implementation: setFlagRollout,
};
