import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './utils/logger.js';
import { UnleashAdminClient } from './client/unleashAdminClient.js';
import { ConfigError, normalizeError, type NormalizedError } from './utils/errors.js';

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  server: McpServer;
  unleashClient: UnleashAdminClient;
}

export interface ToolErrorResult {
  error: NormalizedError;
}

export function bootstrapContext(server: McpServer): AppContext {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const unleashClient = new UnleashAdminClient({
    baseUrl: config.baseUrl,
    token: config.pat,
    dryRun: config.dryRun,
    logger
  });

  return {
    config,
    logger,
    server,
    unleashClient
  };
}

export function ensureProjectId(explicitProjectId: string | undefined, context: AppContext): string {
  if (explicitProjectId) {
    return explicitProjectId;
  }

  if (context.config.defaultProject) {
    return context.config.defaultProject;
  }

  throw new ConfigError('Project ID is required. Provide it via the tool input or UNLEASH_DEFAULT_PROJECT.');
}

export function handleToolError(error: unknown, context: AppContext) {
  const normalized = normalizeError(error);
  context.logger.error('feature_flag.create failed', { error: normalized });

  return {
    content: [
      {
        type: 'text' as const,
        text: `Feature flag creation failed: ${normalized.message}${normalized.hint ? ` — ${normalized.hint}` : ''}`
      }
    ],
    isError: true,
    structuredContent: {
      success: false,
      error: normalized
    }
  };
}
