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

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createLogger, type ServerContext } from './context.js';
import {
  FEATURE_FLAG_RESOURCE_URI,
  FEATURE_FLAGS_RESOURCE_TEMPLATE,
  PROJECTS_RESOURCE_TEMPLATE,
  parseFeatureFlagsResourceOptions,
  parseProjectsResourceOptions,
  readFeatureFlagResource,
  readFeatureFlagsResource,
  readProjectsResource,
} from './resources/unleashResources.js';
import { cleanupFlagTool } from './tools/cleanupFlag.js';
import { createFlagTool } from './tools/createFlag.js';
import { detectFlagTool } from './tools/detectFlag.js';
import { evaluateChangeTool } from './tools/evaluateChange.js';
import { getFlagStateTool } from './tools/getFlagState.js';
import { removeFlagStrategyTool } from './tools/removeFlagStrategy.js';
import { setFlagRolloutTool } from './tools/setFlagRollout.js';
import { toggleFlagEnvironmentTool } from './tools/toggleFlagEnvironment.js';
import type { ToolType } from './tools/types.js';
import { wrapChangeTool } from './tools/wrapChange.js';
import { UnleashClient } from './unleash/client.js';
import { VERSION } from './version.js';

/**
 * Main entry point for the MCP server.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const config = loadConfig();
  const logger = createLogger(config.server.logLevel);

  logger.info(`Starting Unleash MCP Server ${VERSION}`);
  logger.info(`Base URL: ${config.unleash.baseUrl}`);
  logger.info(`Dry run: ${config.server.dryRun}`);

  if (config.unleash.defaultProject) {
    logger.info(`Default project: ${config.unleash.defaultProject}`);
  }

  // Create Unleash Admin API client
  const unleashClient = new UnleashClient(
    config.unleash.baseUrl,
    config.unleash.pat,
    config.server.dryRun,
  );

  const instructions = [
    'Use this tool for local development to increase confidence by decoupling the change from deployments:',
    '1) Call evaluate_change to get a risk assessment on the current code change.',
    '2) The evaluate_change tool will automatically call detect_flag to search for existing flags to prevent duplicates.',
    '3) If an existing flag is found, use it. If the code change is risky and no flag exists, create a feature flag with create_flag.',
    '4) Use wrap_change to guard code with an Unleash flag.',
    '5) When a flag is rolled out and ready to be removed, use cleanup_flag to safely remove the flag code while preserving the desired path.',
  ].join('\n');

  // Create MCP server
  const server = new McpServer(
    {
      name: 'unleash-mcp',
      version: VERSION,
      title:
        'Local development assistant. After making a code change follow this workflow: evaluate_change → create_flag → wrap_change to score risk and steer next steps.',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        resources: {},
      },
      instructions,
    },
  );

  // Build shared context
  const context: ServerContext = {
    server,
    config,
    unleashClient,
    logger,
  };

  type ProgressExtra = { _meta?: { progressToken?: string | number } };

  const tools = [
    createFlagTool,
    evaluateChangeTool,
    detectFlagTool,
    wrapChangeTool,
    cleanupFlagTool,
    setFlagRolloutTool,
    getFlagStateTool,
    toggleFlagEnvironmentTool,
    removeFlagStrategyTool,
  ];

  tools.forEach((tool: ToolType) => {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      (args: unknown, extra: ProgressExtra) =>
        tool.implementation(context, args, extra._meta?.progressToken),
    );
  });
  registerResources(context);

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

function registerResources(context: ServerContext): void {
  const projectsTemplate = new ResourceTemplate(PROJECTS_RESOURCE_TEMPLATE, {
    list: undefined,
  });

  context.server.registerResource(
    'unleash-projects-filtered',
    projectsTemplate,
    {
      mimeType: 'application/json',
      description:
        'Unleash projects with optional query parameters. Use limit to control page size, order=asc|desc to sort by creation time, and offset to paginate.',
    },
    async (uri: URL, _variables: unknown, _extra: unknown) => ({
      contents: [await readProjectsResource(context, parseProjectsResourceOptions(uri.toString()))],
    }),
  );

  const featureFlagsTemplate = new ResourceTemplate(FEATURE_FLAGS_RESOURCE_TEMPLATE, {
    list: undefined,
  });

  context.server.registerResource(
    'unleash-feature-flags-by-project',
    featureFlagsTemplate,
    {
      mimeType: 'application/json',
      description:
        'Feature flags for a specific Unleash project. Replace {projectId}; optional limit/order/offset parameters help paginate flags alphabetically.',
    },
    async (uri: URL, variables: any, _extra: unknown) => {
      const projectId = variables.projectId;
      if (!projectId) {
        throw new Error('Project ID missing from feature flags URI');
      }

      return {
        contents: [
          await readFeatureFlagsResource(
            context,
            projectId,
            parseFeatureFlagsResourceOptions(uri.toString()),
          ),
        ],
      };
    },
  );

  const featureFlagTemplate = new ResourceTemplate(FEATURE_FLAG_RESOURCE_URI, {
    list: undefined,
  });

  context.server.registerResource(
    'unleash-feature-flag',
    featureFlagTemplate,
    {
      mimeType: 'application/json',
      description: 'Single feature flag resource.',
    },
    async (_uri: URL, variables: any, _extra: unknown) => {
      const { projectId, flagName } = variables;
      if (!projectId) {
        throw new Error('Project ID missing from feature flag URI');
      }
      if (!flagName) {
        throw new Error('Flag name missing from feature flag URI');
      }

      return {
        contents: [await readFeatureFlagResource(context, projectId, flagName)],
      };
    },
  );
}
