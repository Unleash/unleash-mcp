import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bootstrapContext } from './context.js';
import { registerFeatureFlagCreateTool } from './tools/featureFlagCreate.js';
import type { AppContext } from './context.js';

const instructions = [
  'Use feature_flag.create to create feature flags via the Unleash Admin API.',
  'Always capture why the flag exists in the description so it can be cleaned up quickly (see https://docs.getunleash.io/topics/feature-flags/best-practices-using-feature-flags-at-scale).',
  'Prefer reusing existing flags when possible; only create a new flag when the change cannot ride on an existing rollout guard.',
  'The server currently exposes only feature_flag.create; evaluation and wrapping surfaces will arrive in later iterations.'
].join('\n');

async function main() {
  const server = new McpServer(
    {
      name: 'unleash-mcp',
      version: '0.1.0'
    },
    {
      instructions
    }
  );

  let context: AppContext;
  try {
    context = bootstrapContext(server);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to initialize Unleash MCP server: ${message}`);
    process.exit(1);
    return;
  }

  registerFeatureFlagCreateTool(server, context);

  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    context.logger.info('Unleash MCP server is ready', {
      tools: ['feature_flag.create'],
      dryRun: context.config.dryRun
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.error('Failed to connect MCP transport', { error: message });
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
