import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { UriTemplate } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { type Config, normalizeBaseUrl } from './config.js';
import { createLogger, type Logger, type ServerContext } from './context.js';
import {
  extractFlagNameFromFeatureUri,
  extractProjectIdFromFeatureUri,
  FEATURE_FLAG_RESOURCE_URI,
  FEATURE_FLAGS_RESOURCE_TEMPLATE,
  isFeatureFlagsUri,
  isFeatureFlagUri,
  isProjectsUri,
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
import { getCustomEventSummaryTool } from './tools/getCustomEventSummary.js';
import { getCustomEventsTool } from './tools/getCustomEvents.js';
import { getFeatureAttributionTool } from './tools/getFeatureAttribution.js';
import { getFeatureExposureSummaryTool } from './tools/getFeatureExposureSummary.js';
import { getFeatureExposuresTool } from './tools/getFeatureExposures.js';
import { getFlagStateTool } from './tools/getFlagState.js';
import { getTopImpressionEventsTool } from './tools/getTopImpressionEvents.js';
import { removeFlagStrategyTool } from './tools/removeFlagStrategy.js';
import { setFlagRolloutTool } from './tools/setFlagRollout.js';
import { toggleFlagEnvironmentTool } from './tools/toggleFlagEnvironment.js';
import type { ToolDefinition } from './tools/types.js';
import { wrapChangeTool } from './tools/wrapChange.js';
import { UnleashClient } from './unleash/client.js';
import { notifyProgress } from './utils/streaming.js';
import { VERSION } from './version.js';

export interface CreateServerOptions {
  baseUrl: string;
  authHeaders: Record<string, string>;
  defaultProject?: string;
  defaultEnvironment?: string;
  dryRun?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logger?: Logger;
}

class UriTemplateWithMatcher extends UriTemplate {
  matchFn: (uri: string) => Variables | null;

  constructor(template: string, matchFn: (uri: string) => Variables | null) {
    super(template);
    this.matchFn = matchFn;
  }

  match(uri: string): Variables | null {
    return this.matchFn(uri);
  }
}

export function createUnleashMcpServer(options: CreateServerOptions): McpServer {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const dryRun = options.dryRun ?? false;
  const logLevel = options.logLevel ?? 'error';
  const logger = options.logger ?? createLogger(logLevel);

  // Build a Config object for ServerContext. The pat field is a placeholder —
  // no tool reads config.unleash.pat; auth is handled via authHeaders in UnleashClient.
  const config: Config = {
    unleash: {
      baseUrl,
      pat: '',
      defaultProject: options.defaultProject,
      defaultEnvironment: options.defaultEnvironment,
    },
    server: {
      dryRun,
      logLevel,
    },
  };

  const unleashClient = new UnleashClient(baseUrl, options.authHeaders, dryRun);

  const instructions = [
    'Use this tool for local development to increase confidence by decoupling the change from deployments:',
    '1) Call evaluate_change to get a risk assessment on the current code change.',
    '2) The evaluate_change tool will automatically call detect_flag to search for existing flags to prevent duplicates.',
    '3) If an existing flag is found, use it. If the code change is risky and no flag exists, create a feature flag with create_flag.',
    '4) Use wrap_change to guard code with an Unleash flag.',
    '5) When a flag is rolled out and ready to be removed, use cleanup_flag to safely remove the flag code while preserving the desired path.',
  ].join('\n');

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

  const context: ServerContext = {
    config,
    unleashClient,
    logger,
    cache: { projects: null, featureFlags: new Map() },
    notifyProgress: notifyProgress(server),
  };

  type ProgressExtra = { _meta?: { progressToken?: string | number } };

  const tools: ToolDefinition[] = [
    createFlagTool,
    evaluateChangeTool,
    detectFlagTool,
    wrapChangeTool,
    cleanupFlagTool,
    setFlagRolloutTool,
    getFlagStateTool,
    toggleFlagEnvironmentTool,
    removeFlagStrategyTool,
    getFeatureExposuresTool,
    getFeatureExposureSummaryTool,
    getTopImpressionEventsTool,
    getCustomEventsTool,
    getCustomEventSummaryTool,
    getFeatureAttributionTool,
  ];

  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: { description?: string; inputSchema?: ToolDefinition['inputSchema'] },
    cb: (args: unknown, extra: ProgressExtra) => unknown,
  ) => unknown;

  tools.forEach((tool) => {
    registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      (args: unknown, extra: ProgressExtra) =>
        tool.implementation(context, args, extra._meta?.progressToken),
    );
  });

  registerResources(server, context);

  return server;
}

function registerResources(server: McpServer, context: ServerContext): void {
  const projectsTemplate = new ResourceTemplate(
    new UriTemplateWithMatcher(PROJECTS_RESOURCE_TEMPLATE, (uri) =>
      isProjectsUri(uri) ? {} : null,
    ),
    { list: undefined },
  );

  server.registerResource(
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

  const featureFlagsTemplate = new ResourceTemplate(
    new UriTemplateWithMatcher(FEATURE_FLAGS_RESOURCE_TEMPLATE, (uri) => {
      if (!isFeatureFlagsUri(uri)) {
        return null;
      }

      const projectId = extractProjectIdFromFeatureUri(uri);
      return projectId ? { projectId } : null;
    }),
    { list: undefined },
  );

  server.registerResource(
    'unleash-feature-flags-by-project',
    featureFlagsTemplate,
    {
      mimeType: 'application/json',
      description:
        'Feature flags for a specific Unleash project. Replace {projectId}; optional limit/order/offset parameters help paginate flags alphabetically.',
    },
    async (uri: URL, variables: Variables, _extra: unknown) => {
      const projectId = variables.projectId as string | undefined;
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

  const featureFlagTemplate = new ResourceTemplate(
    new UriTemplateWithMatcher(FEATURE_FLAG_RESOURCE_URI, (uri) => {
      if (!isFeatureFlagUri(uri)) {
        return null;
      }

      const projectId = extractProjectIdFromFeatureUri(uri);
      const flagName = extractFlagNameFromFeatureUri(uri);

      if (!projectId || !flagName) {
        return null;
      }

      return { projectId, flagName };
    }),
    { list: undefined },
  );

  server.registerResource(
    'unleash-feature-flag',
    featureFlagTemplate,
    {
      mimeType: 'application/json',
      description: 'Single feature flag resource.',
    },
    async (_uri: URL, variables: Variables, _extra: unknown) => {
      const { projectId, flagName } = variables as { projectId?: string; flagName?: string };
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
