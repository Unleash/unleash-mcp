import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Helper to emit progress notifications during tool execution.
 * Provides visibility into long-running operations for the LLM.
 */
export async function notifyProgress(
  server: Server,
  progressToken: string | number | undefined,
  progress: number,
  total: number,
  message: string
): Promise<void> {
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
    await server.notification({
      method: 'notifications/message',
      params: {
        level: 'info',
        logger: 'unleash-mcp',
        data: message,
      },
    });
  } catch (error) {
    // Silently ignore notification errors - the client may not support them
    // The operation will continue successfully regardless
  }
}

/**
 * Helper to create resource links for created feature flags.
 * Returns both a human-readable URL and an MCP resource link.
 */
export function createFlagResourceLink(
  baseUrl: string,
  projectId: string,
  flagName: string
): { url: string; resource: { uri: string; mimeType?: string; text?: string } } {
  // Unleash Admin UI URL for the feature flag
  const url = `${baseUrl}/projects/${projectId}/features/${flagName}`;

  return {
    url,
    resource: {
      uri: `unleash://feature-flag/${projectId}/${flagName}`,
      mimeType: 'application/json',
      text: `Feature flag: ${flagName}`,
    },
  };
}

/**
 * Format a success message with the flag details and link.
 */
export function formatFlagCreatedMessage(
  flagName: string,
  projectId: string,
  url: string,
  dryRun: boolean
): string {
  if (dryRun) {
    return `[DRY RUN] Would create feature flag "${flagName}" in project "${projectId}".\nURL: ${url}`;
  }

  return `Successfully created feature flag "${flagName}" in project "${projectId}".\nView in Unleash: ${url}`;
}
