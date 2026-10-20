import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { releaseInput } from './tools/releaseInput.ts';
import { releaseOutput } from './tools/releaseOutput.ts';
import { createRelease } from './tools/release.ts';
import type { UnleashClient } from './unleash/client.ts';

export const createServer = (unleash: UnleashClient): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });
  const release = createRelease(unleash);

  server.registerTool(
    'release',
    {
      description: 'Release a feature flag to a percentage of users in an environment.',
      inputSchema: releaseInput,
      outputSchema: releaseOutput,
    },
    async (input) => {
      const result = await release(input);
      return { structuredContent: { result }, isError: result.kind === 'failed', content: [] };
    },
  );

  return server;
};
