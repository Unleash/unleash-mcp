import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { createProgressReporter } from '../utils/streaming.js';
import { ensureProjectId, handleToolError, type AppContext } from '../context.js';

const FeatureFlagTypeSchema = z.enum(['experiment', 'kill-switch', 'release', 'operational', 'permission']);

const TrimmedString = z
  .string()
  .trim()
  .min(1, 'Value is required');

const FeatureFlagCreateInputSchema = z.object({
  projectId: TrimmedString.optional().describe('Target Unleash project ID. Optional when UNLEASH_DEFAULT_PROJECT is configured.'),
  name: TrimmedString.describe('Unique feature flag name. Keep it descriptive and scoped to the change.'),
  type: FeatureFlagTypeSchema.describe('Flag type: release (default for gradual rollouts), experiment, kill-switch, operational, or permission.'),
  description: TrimmedString.describe('Short summary explaining why this flag exists and how it will be cleaned up.')
});

type FeatureFlagCreateInput = z.infer<typeof FeatureFlagCreateInputSchema>;

export function registerFeatureFlagCreateTool(server: McpServer, context: AppContext) {
  server.registerTool(
    'feature_flag.create',
    {
      title: 'Create Unleash feature flag',
      description: 'Creates a feature flag through the Unleash Admin API, returning UI and API links.',
      inputSchema: FeatureFlagCreateInputSchema.shape
    },
    async (
      args: FeatureFlagCreateInput,
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>
    ): Promise<CallToolResult> => {
      const progress = createProgressReporter(extra);

      try {
        await progress.report({ progress: 5, message: 'Validating inputs' });

        const parsed = FeatureFlagCreateInputSchema.parse(args);
        const projectId = ensureProjectId(parsed.projectId, context);

        await progress.report({ progress: 15, message: `Preparing request for project "${projectId}"` });

        context.logger.info('Creating feature flag', {
          projectId,
          name: parsed.name,
          type: parsed.type
        });

        const result = await context.unleashClient.createFeatureFlag(
          {
            projectId,
            name: parsed.name,
            type: parsed.type,
            description: parsed.description
          },
          { signal: extra.signal }
        );

        const message = result.dryRun
          ? `Dry-run: feature flag "${parsed.name}" would be created in project "${projectId}".`
          : `Feature flag "${parsed.name}" created in project "${projectId}".`;

        await progress.report({ progress: 90, message: 'Flag created, compiling response' });

        const structuredContent = {
          success: true,
          dryRun: result.dryRun,
          feature: {
            name: result.feature.name,
            project: projectId,
            type: result.feature.type ?? parsed.type,
            description: result.feature.description ?? parsed.description
          },
          links: result.links
        };

        const response: CallToolResult = {
          content: [
            {
              type: 'text',
              text: [
                message,
                `Admin UI: ${result.links.ui}`,
                `Admin API: ${result.links.api}`
              ].join('\n')
            },
            {
              type: 'resource_link',
              uri: result.links.api,
              name: parsed.name,
              mimeType: 'application/json',
              description: 'Fetch feature flag details via the Unleash Admin API.'
            }
          ],
          structuredContent
        };

        await progress.report({ progress: 100, message: 'Done' });

        return response;
      } catch (error) {
        return handleToolError(error, context);
      }
    }
  );
}
