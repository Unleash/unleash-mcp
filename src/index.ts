#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { hasTrailingApiSegment, loadConfig } from './config.js';
import { createLogger } from './context.js';
import { createUnleashMcpServer } from './server.js';
import { enableStdioLogging } from './utils/stdioLogging.js';
import { VERSION } from './version.js';

/**
 * Stdio entry point for the Unleash MCP Server.
 * Reads configuration from environment variables and CLI flags,
 * creates the MCP server via the shared factory, and connects
 * a StdioServerTransport.
 */
async function main(): Promise<void> {
  // Optional diagnostic logging of stdio without modifying protocol flow.
  enableStdioLogging();

  // Load and validate configuration
  const config = loadConfig();
  const logger = createLogger(config.server.logLevel);

  logger.info(`Starting Unleash MCP Server ${VERSION}`);
  logger.info(`Base URL: ${config.unleash.baseUrl}`);
  logger.info(`Dry run: ${config.server.dryRun}`);

  // If the configured UNLEASH_BASE_URL had a trailing `/api`, normalizeBaseUrl
  // stripped it. Surface that explicitly so users debugging connectivity see
  // what changed and don't think their config was ignored. The Unleash SDKs
  // require `/api` in the base URL; the MCP server adds it back internally for
  // the endpoints it hits — both forms are accepted.
  const rawBaseUrl = process.env.UNLEASH_BASE_URL ?? '';
  if (hasTrailingApiSegment(rawBaseUrl)) {
    logger.info(
      `Note: UNLEASH_BASE_URL had a trailing /api which was stripped (normalized to ${config.unleash.baseUrl}). Both forms are accepted. Remove /api from UNLEASH_BASE_URL to avoid this message.`,
    );
  }

  if (config.unleash.defaultProject) {
    logger.info(`Default project: ${config.unleash.defaultProject}`);
  }

  const server = createUnleashMcpServer({
    baseUrl: config.unleash.baseUrl,
    authHeaders: { Authorization: config.unleash.pat.trim() },
    defaultProject: config.unleash.defaultProject,
    defaultEnvironment: config.unleash.defaultEnvironment,
    dryRun: config.server.dryRun,
    logLevel: config.server.logLevel,
    attributionEnabled: config.server.attributionEnabled,
    logger,
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Unleash MCP Server started successfully');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
