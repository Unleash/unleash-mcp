import fs from 'node:fs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from './config.js';
import type { FeatureFlagSummary, UnleashClient, UnleashProjectSummary } from './unleash/client.js';
import { normalizeError } from './utils/errors.js';

export interface ResourceCache {
  projects: { data: UnleashProjectSummary[]; fetchedAt: number } | null;
  featureFlags: Map<string, { data: FeatureFlagSummary[]; fetchedAt: number }>;
}

/**
 * Shared runtime context available to all tools and prompts.
 * Provides centralized access to configuration, clients, and utilities.
 */
export interface ServerContext {
  config: Config;
  unleashClient: UnleashClient;
  logger: Logger;
  cache: ResourceCache;
  notifyProgress: (
    progressToken: string | number | undefined,
    current: number,
    total: number,
    message?: string,
  ) => Promise<void>;
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
  const appLogFile = process.env.APP_LOG_FILE;

  function shouldLog(level: string): boolean {
    const levelIndex = levels.indexOf(level);
    return levelIndex >= currentLevelIndex;
  }

  // Write logs to a file when provided; otherwise use stderr. Never write to stdout.
  const writeLog = (prefix: string, message: string, args: unknown[]): void => {
    const line = `${prefix} ${message}${args.length ? ` ${args.map(String).join(' ')}` : ''}\n`;
    if (appLogFile) {
      try {
        fs.appendFileSync(appLogFile, line);
        return;
      } catch {
        // Fall back to stderr if file writing fails.
      }
    }
    console.error(line.trimEnd());
  };

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        writeLog('[DEBUG]', message, args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        writeLog('[INFO]', message, args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        writeLog('[WARN]', message, args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        writeLog('[ERROR]', message, args);
      }
    },
  };
}

/**
 * Resolve a project ID from provided value, default config, or API discovery.
 * Returns the project ID string, or undefined if it could not be resolved.
 */
export async function resolveProjectId(
  providedProjectId: string | undefined,
  context: ServerContext,
): Promise<string | undefined> {
  if (providedProjectId) {
    return providedProjectId;
  }

  const defaultProjectId = context.config.unleash.defaultProject;
  if (defaultProjectId) {
    return defaultProjectId;
  }

  const projects = await context.unleashClient.listProjects();
  if (projects.length === 1) {
    return projects[0].id;
  }

  return undefined;
}

/**
 * Build a CallToolResult that asks the user to pick a project.
 */
export async function askForProjectId(context: ServerContext): Promise<CallToolResult> {
  const projects = await context.unleashClient.listProjects();

  if (projects.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No projects found in Unleash. Create a project first.',
        },
      ],
    };
  }

  const projectList = projects.map((p) => `- ${p.id}: ${p.name}`).join('\n');
  return {
    content: [
      {
        type: 'text' as const,
        text: `Multiple projects found. Ask the user which project to use before proceeding:\n${projectList}`,
      },
    ],
  };
}

/**
 * Handle tool errors consistently by normalizing them and logging.
 * Returns a formatted error object suitable for MCP tool responses.
 */
export function handleToolError(
  context: ServerContext,
  error: unknown,
  toolName: string,
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
