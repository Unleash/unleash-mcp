#!/usr/bin/env node

/**
 * Unleash MCP Server
 *
 * A purpose-driven Model Context Protocol server for managing Unleash feature flags.
 * This server provides tools for creating feature flags while following Unleash best practices.
 *
 * Phase 1 implements:
 * - create_flag: Create feature flags via the Unleash Admin API
 *
 * Phase 2 implements:
 * - evaluate_change: Prompt to guide when flags are needed
 *
 * Phase 3 implements:
 * - wrap_change: Generate code snippets for flag usage
 *
 * Architecture principles:
 * - Thin, purpose-driven surface area
 * - One file per capability
 * - Shared helpers only where they remove duplication
 * - Explicit validation and error handling
 * - Progress streaming for visibility
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { UnleashClient } from './unleash/client.js';
import { ServerContext, createLogger, handleToolError } from './context.js';
import { createFlag, createFlagTool } from './tools/createFlag.js';
import { evaluateChange, evaluateChangeTool } from './tools/evaluateChange.js';
import { wrapChange, wrapChangeTool } from './tools/wrapChange.js';

/**
 * Main entry point for the MCP server.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const config = loadConfig();
  const logger = createLogger(config.server.logLevel);

  logger.info('Starting Unleash MCP Server');
  logger.info(`Base URL: ${config.unleash.baseUrl}`);
  logger.info(`Dry run: ${config.server.dryRun}`);

  if (config.unleash.defaultProject) {
    logger.info(`Default project: ${config.unleash.defaultProject}`);
  }

  // Create Unleash Admin API client
  const unleashClient = new UnleashClient(
    config.unleash.baseUrl,
    config.unleash.pat,
    config.server.dryRun
  );

  // Create MCP server
  const server = new Server(
    {
      name: 'unleash-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Build shared context
  const context: ServerContext = {
    server,
    config,
    unleashClient,
    logger,
  };

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [createFlagTool, evaluateChangeTool, wrapChangeTool],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      logger.debug(`Tool called: ${name}`, args);

      switch (name) {
        case 'create_flag':
          return await createFlag(context, args, request.params._meta?.progressToken);

        case 'evaluate_change':
          return await evaluateChange(context, args);

        case 'wrap_change':
          return await wrapChange(context, args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const toolName = request.params.name || 'unknown';
      return handleToolError(context, error, toolName);
    }
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
