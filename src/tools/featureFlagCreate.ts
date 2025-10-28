import { z } from 'zod';
import { ServerContext, ensureProjectId, handleToolError } from '../context.js';
import { FeatureFlagType } from '../unleash/client.js';
import { notifyProgress, createFlagResourceLink, formatFlagCreatedMessage } from '../utils/streaming.js';

/**
 * Input schema for the feature_flag.create tool.
 * Validates all required parameters using Zod.
 */
const createFeatureFlagSchema = z.object({
  projectId: z.string().optional().describe('Project ID where the flag will be created (optional if default is set)'),
  name: z.string().min(1).describe('Feature flag name (must be unique within the project)'),
  type: z.enum(['release', 'experiment', 'operational', 'kill-switch', 'permission'])
    .describe('Feature flag type - determines the lifecycle and usage pattern'),
  description: z.string().min(1).describe('Clear description of what this flag controls and why it exists'),
  impressionData: z.boolean().optional().describe('Enable impression data collection for analytics (optional)'),
});

type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

/**
 * feature_flag.create tool implementation.
 * Creates a new feature flag in Unleash via the Admin API.
 *
 * Purpose:
 * - Provide a simple interface for creating feature flags
 * - Validate inputs before making API calls
 * - Stream progress to provide visibility during creation
 * - Return both human-readable output and structured resource links
 *
 * Best Practices (from https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale):
 * - Choose the right flag type for your use case
 * - Provide clear, descriptive names and descriptions
 * - Document the flag's purpose and expected lifecycle
 * - Plan for flag cleanup after rollout is complete
 */
export async function createFeatureFlag(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number
): Promise<{ content: Array<{ type: string; text: string }> }> {
  try {
    // Validate input
    const input: CreateFeatureFlagInput = createFeatureFlagSchema.parse(args);

    // Ensure project ID is available
    const projectId = ensureProjectId(input.projectId, context.config.unleash.defaultProject);

    context.logger.info(`Creating feature flag "${input.name}" in project "${projectId}"`);

    // Notify progress: Starting
    await notifyProgress(
      context.server,
      progressToken,
      0,
      100,
      `Creating feature flag "${input.name}"...`
    );

    // Call Unleash API to create the flag
    const response = await context.unleashClient.createFeatureFlag(projectId, {
      name: input.name,
      type: input.type as FeatureFlagType,
      description: input.description,
      impressionData: input.impressionData,
    });

    // Notify progress: Complete
    await notifyProgress(
      context.server,
      progressToken,
      100,
      100,
      `Feature flag "${input.name}" created successfully`
    );

    // Create resource link
    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      response.name
    );

    // Format success message
    const message = formatFlagCreatedMessage(
      response.name,
      projectId,
      url,
      context.config.server.dryRun
    );

    context.logger.info(message);

    // Return response with both text and resource link
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
        {
          type: 'text',
          text: `Resource URI: ${resource.uri}`,
        },
      ],
    };
  } catch (error) {
    // Handle errors consistently
    const errorResult = handleToolError(context, error, 'feature_flag.create');

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorResult.error.message}${errorResult.error.hint ? `\n\nHint: ${errorResult.error.hint}` : ''}`,
        },
      ],
    };
  }
}

/**
 * Tool definition for MCP server registration.
 */
export const featureFlagCreateTool = {
  name: 'feature_flag.create',
  description: `Create a new feature flag in Unleash.

This tool creates a feature flag with the specified configuration. Choose the appropriate flag type:
- release: For gradual feature rollouts to users
- experiment: For A/B tests and experiments
- operational: For system behavior and operational toggles
- kill-switch: For emergency shutdowns or circuit breakers
- permission: For role-based access control

Best practices:
1. Use clear, descriptive names (e.g., "new-checkout-flow" not "flag1")
2. Write comprehensive descriptions explaining the flag's purpose
3. Choose the right type to signal intent and lifecycle
4. Plan for flag removal after successful rollout

See: https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale`,
  inputSchema: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Project ID where the flag will be created (optional if UNLEASH_DEFAULT_PROJECT is set)',
      },
      name: {
        type: 'string',
        description: 'Feature flag name (must be unique within the project). Use descriptive names like "new-checkout-flow"',
      },
      type: {
        type: 'string',
        enum: ['release', 'experiment', 'operational', 'kill-switch', 'permission'],
        description: 'Feature flag type - determines the lifecycle and usage pattern',
      },
      description: {
        type: 'string',
        description: 'Clear description of what this flag controls, why it exists, and when it should be removed',
      },
      impressionData: {
        type: 'boolean',
        description: 'Enable impression data collection for analytics (optional, defaults to false)',
      },
    },
    required: ['name', 'type', 'description'],
  },
};
