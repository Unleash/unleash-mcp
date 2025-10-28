import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Config } from './config.js';
import { UnleashClient } from './unleash/client.js';
import { normalizeError } from './utils/errors.js';

/**
 * Shared runtime context available to all tools and prompts.
 * Provides centralized access to configuration, clients, and utilities.
 */
export interface ServerContext {
  server: Server;
  config: Config;
  unleashClient: UnleashClient;
  logger: Logger;
}

/**
 * Simple logger interface for consistent logging across the application.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Create a logger instance based on the configured log level.
 */
export function createLogger(logLevel: string): Logger {
  const levels = ['debug', 'info', 'warn', 'error'];
  const currentLevelIndex = levels.indexOf(logLevel);

  function shouldLog(level: string): boolean {
    const levelIndex = levels.indexOf(level);
    return levelIndex >= currentLevelIndex;
  }

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        console.debug(`[DEBUG] ${message}`, ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        console.info(`[INFO] ${message}`, ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        console.warn(`[WARN] ${message}`, ...args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        console.error(`[ERROR] ${message}`, ...args);
      }
    },
  };
}

/**
 * Ensure a project ID is available, using the default if not provided.
 * Helper function to simplify project ID handling in tools.
 */
export function ensureProjectId(
  providedProjectId: string | undefined,
  defaultProjectId: string | undefined
): string {
  if (providedProjectId) {
    return providedProjectId;
  }

  if (defaultProjectId) {
    return defaultProjectId;
  }

  throw new Error(
    'Project ID is required. Either provide it as a parameter or set UNLEASH_DEFAULT_PROJECT in your .env file.'
  );
}

/**
 * Handle tool errors consistently by normalizing them and logging.
 * Returns a formatted error object suitable for MCP tool responses.
 */
export function handleToolError(
  context: ServerContext,
  error: unknown,
  toolName: string
): CallToolResult {
  const normalized = normalizeError(error);

  context.logger.error(`Error in ${toolName}:`, {
    code: normalized.code,
    message: normalized.message,
    hint: normalized.hint,
  });

  const hintSuffix = normalized.hint ? `\n\nHint: ${normalized.hint}` : '';

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${normalized.message}${hintSuffix}`,
      },
    ],
    structuredContent: {
      success: false,
      error: normalized,
    },
  };
}
