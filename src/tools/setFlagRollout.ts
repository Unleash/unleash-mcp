import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ServerContext, ensureProjectId, handleToolError } from '../context.js';
import { notifyProgress, createFlagResourceLink } from '../utils/streaming.js';
import { StrategyVariant, StrategyVariantPayload } from '../unleash/client.js';

const variantPayloadSchema = z.object({
  type: z.enum(['json', 'csv', 'string', 'number']).describe('Payload type'),
  value: z.string().min(1).describe('Serialized payload value'),
}) satisfies z.ZodType<StrategyVariantPayload>;

const variantSchema = z
  .object({
    name: z.string().min(1).describe('Variant name (unique within this feature)'),
    weight: z.number().int().min(0).max(1000).describe('Variant weight (0-1000)'),
    weightType: z.enum(['variable', 'fix']).optional().describe('Variant weight type'),
    stickiness: z
      .string()
      .min(1)
      .optional()
      .describe('Stickiness to use for this variant (defaults to "default")'),
    payload: variantPayloadSchema.optional(),
  })
  .describe('Strategy-level variant definition');

const setFlagRolloutSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Project ID (optional if UNLEASH_DEFAULT_PROJECT is configured)'),
  featureName: z.string().min(1).describe('Feature flag name'),
  environment: z.string().min(1).describe('Environment name'),
  rolloutPercentage: z
    .number()
    .min(0)
    .max(100)
    .describe('Rollout percentage (0-100) for the flexibleRollout strategy'),
  groupId: z
    .string()
    .optional()
    .describe('Group ID for stickiness bucketing (defaults to feature name)'),
  stickiness: z
    .string()
    .optional()
    .describe('Stickiness field (defaults to "default")'),
  title: z
    .string()
    .optional()
    .describe('Optional descriptive title for the strategy'),
  disabled: z
    .boolean()
    .optional()
    .describe('Whether to disable the strategy (defaults to false)'),
  variants: z
    .array(variantSchema)
    .optional()
    .describe('Optional list of strategy-level variants'),
});

type SetFlagRolloutInput = z.infer<typeof setFlagRolloutSchema>;

export async function setFlagRollout(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number
): Promise<CallToolResult> {
  try {
    const input: SetFlagRolloutInput = setFlagRolloutSchema.parse(args);

    const projectId = ensureProjectId(input.projectId, context.config.unleash.defaultProject);

    const rolloutDisplay = `${input.rolloutPercentage}%`;
    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';

    await notifyProgress(
      context.server,
      progressToken,
      0,
      100,
      `${mode}Configuring flexibleRollout strategy for "${input.featureName}" (${rolloutDisplay})...`
    );

    const variants: StrategyVariant[] | undefined = input.variants?.map((variant) => ({
      name: variant.name,
      weight: variant.weight,
      weightType: variant.weightType ?? 'variable',
      stickiness: variant.stickiness ?? 'default',
      ...(variant.payload ? { payload: variant.payload } : {}),
    }));

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
      }
    );

    await notifyProgress(
      context.server,
      progressToken,
      100,
      100,
      `${mode}Strategy configured for "${input.featureName}" in "${input.environment}"`
    );

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId
    )}/features/${encodeURIComponent(input.featureName)}/environments/${encodeURIComponent(
      input.environment
    )}/strategies`;

    const message = context.config.server.dryRun
      ? `[DRY RUN] Would configure flexibleRollout strategy for "${input.featureName}" in "${input.environment}" at ${rolloutDisplay}.`
      : `Configured flexibleRollout strategy for "${input.featureName}" in "${input.environment}" at ${rolloutDisplay}.`;

    context.logger.info(
      `${message}${input.disabled ? ' Strategy is marked as disabled.' : ''}`
    );

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
          text: resource.text,
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
  description: `Configure or update a flexibleRollout strategy for a feature flag environment with an optional rollout percentage and variants. This does NOT enable the feature; call toggle_flag_environment to turn environments on or off.`,
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
        description: 'Target environment',
      },
      rolloutPercentage: {
        type: 'number',
        description: 'Rollout percentage (0-100)',
      },
      groupId: {
        type: 'string',
        description: 'Group ID for stickiness bucketing (defaults to the feature name)',
      },
      stickiness: {
        type: 'string',
        description: 'Stickiness field (defaults to "default")',
      },
      title: {
        type: 'string',
        description: 'Optional descriptive title for the strategy',
      },
      disabled: {
        type: 'boolean',
        description: 'Disable the strategy (defaults to false)',
      },
      variants: {
        type: 'array',
        description: 'Optional list of strategy-level variants',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            weight: { type: 'number' },
            weightType: {
              type: 'string',
              enum: ['variable', 'fix'],
            },
            stickiness: { type: 'string' },
            payload: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['json', 'csv', 'string', 'number'] },
                value: { type: 'string' },
              },
              required: ['type', 'value'],
            },
          },
          required: ['name', 'weight'],
        },
      },
    },
    required: ['featureName', 'environment', 'rolloutPercentage'],
  },
};
