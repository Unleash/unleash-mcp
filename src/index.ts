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
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './config.js';
import { UnleashClient } from './unleash/client.js';
import { ServerContext, createLogger, handleToolError } from './context.js';
import {
  buildFeatureDevelopmentWorkflowDocument,
  featureDevelopmentWorkflowResource,
  isFeatureDevelopmentWorkflowUri,
} from './resources/featureDevelopmentWorkflow.js';
import {
  buildLocalChangeChecklistDocument,
  isLocalChangeChecklistUri,
  localChangeChecklistResource,
} from './resources/localChangeChecklist.js';
import {
  buildWorkspaceSummaryDocument,
  isWorkspaceSummaryUri,
  workspaceSummaryResource,
} from './resources/workspaceSummary.js';
import {
  backendGuardrailsResource,
  buildBackendGuardrailsDocument,
  isBackendGuardrailsUri,
} from './resources/backendGuardrails.js';
import { createFlag, createFlagTool } from './tools/createFlag.js';
import { evaluateChange, evaluateChangeTool } from './tools/evaluateChange.js';
import { wrapChange, wrapChangeTool } from './tools/wrapChange.js';
import {
  prepareLocalChange,
  prepareLocalChangeTool,
} from './tools/prepareLocalChange.js';
import { decideLocalFlow, decideLocalFlowTool } from './tools/decideLocalFlow.js';
import { applyPatch, applyPatchTool } from './tools/applyPatch.js';
import { runChecks, runChecksTool } from './tools/runChecks.js';

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

  const instructions = [
    'Local-change policy:',
    '1) When unsure, call decide_local_flow to confirm this is a local code change.',
    '2) Always call prepare_local_change before editing files in this repository.',
    '3) If the task is risky, user-facing, or mentions feature flags, call evaluate_change.',
    '4) Use wrap_change when guarding code with an Unleash flag and summarize diffs with apply_patch as needed.',
    '5) Before finishing, call run_checks (or run commands manually) to validate formatter, linter, and tests.',
  ].join('\n');

  // Create MCP server
  const server = new Server(
    {
      name: 'unleash-mcp',
      version: '0.1.0',
      description:
        'Purpose-driven Unleash feature flag assistant. Default workflow: decide_local_flow → prepare_local_change → evaluate_change → create_flag → wrap_change → run_checks. Whether you are touching a single file or planning a large refactor, start with prepare_local_change to gather local guardrails, then evaluate_change to score risk and steer next steps.',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        instructions,
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
      tools: [
        decideLocalFlowTool,
        prepareLocalChangeTool,
        evaluateChangeTool,
        createFlagTool,
        wrapChangeTool,
        applyPatchTool,
        runChecksTool,
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      logger.debug(`Tool called: ${name}`, args);

      switch (name) {
        case 'decide_local_flow':
          return await decideLocalFlow(context, args);

        case 'prepare_local_change':
          return await prepareLocalChange(context, args);

        case 'evaluate_change':
          return await evaluateChange(context, args);

        case 'create_flag':
          return await createFlag(context, args, request.params._meta?.progressToken);

        case 'wrap_change':
          return await wrapChange(context, args);

        case 'apply_patch':
          return await applyPatch(context, args);

        case 'run_checks':
          return await runChecks(context, args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const toolName = request.params.name || 'unknown';
      return handleToolError(context, error, toolName);
    }
  });

  // Register proactive guidance resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        workspaceSummaryResource,
        backendGuardrailsResource,
        localChangeChecklistResource,
        featureDevelopmentWorkflowResource,
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (isWorkspaceSummaryUri(uri)) {
      logger.debug(`Reading resource: ${uri}`);
      return {
        contents: [
          {
            uri,
            mimeType: workspaceSummaryResource.mimeType,
            text: await buildWorkspaceSummaryDocument(),
          },
        ],
      };
    }

    if (isBackendGuardrailsUri(uri)) {
      logger.debug(`Reading resource: ${uri}`);
      return {
        contents: [
          {
            uri,
            mimeType: backendGuardrailsResource.mimeType,
            text: buildBackendGuardrailsDocument(),
          },
        ],
      };
    }

    if (isFeatureDevelopmentWorkflowUri(uri)) {
      logger.debug(`Reading resource: ${uri}`);
      return {
        contents: [
          {
            uri,
            mimeType: featureDevelopmentWorkflowResource.mimeType,
            text: buildFeatureDevelopmentWorkflowDocument(config),
          },
        ],
      };
    }

    if (isLocalChangeChecklistUri(uri)) {
      logger.debug(`Reading resource: ${uri}`);
      return {
        contents: [
          {
            uri,
            mimeType: localChangeChecklistResource.mimeType,
            text: buildLocalChangeChecklistDocument(config),
          },
        ],
      };
    }

    logger.warn(`Unknown resource requested: ${uri}`);

    return {
      contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Resource not found: ${uri}. Available resources: unleash://workspace/summary, unleash://guides/backend-guardrails, unleash://guides/local-change-checklist, unleash://guides/feature-development-workflow`,
          },
        ],
      };
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
