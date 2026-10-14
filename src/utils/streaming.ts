import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildFeatureFlagUri } from '../resources/unleashResources.js';

/**
 * Helper to emit progress notifications during tool execution.
 * Provides visibility into long-running operations for the LLM.
 */
export const notifyProgress = (mcpServer: McpServer) => {
  const { server } = mcpServer;
  return async (
    progressToken: string | number | undefined,
    progress: number,
    total: number,
    message?: string,
  ): Promise<void> => {
    if (progressToken === undefined) {
      return;
    }

    try {
      await server.notification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress,
          total,
        },
      });

      // Also send a message notification for visibility
      if (message !== undefined) {
        await server.notification({
          method: 'notifications/message',
          params: {
            level: 'info',
            logger: 'unleash-mcp',
            data: message,
          },
        });
      }
    } catch (_error) {
      // Silently ignore notification errors - the client may not support them
      // The operation will continue successfully regardless
    }
  };
};

/**
 * Build a flag's Admin UI URL and its MCP resource URI.
 */
export function createFlagLinks(
  baseUrl: string,
  projectId: string,
  flagName: string,
): { url: string; resourceUri: string } {
  return {
    url: `${baseUrl}/projects/${projectId}/features/${flagName}`,
    resourceUri: buildFeatureFlagUri(projectId, flagName),
  };
}

/**
 * Format a success message with the flag details and link.
 */
export function formatFlagCreatedMessage(
  flagName: string,
  projectId: string,
  url: string,
  dryRun: boolean,
): string {
  if (dryRun) {
    return `[DRY RUN] Would create feature flag "${flagName}" in project "${projectId}".\nURL: ${url}`;
  }

  return `Successfully created feature flag "${flagName}" in project "${projectId}".\nView in Unleash: ${url}`;
}
