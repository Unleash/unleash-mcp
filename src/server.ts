import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { releaseInput } from './tools/releaseInput.ts';
import { releaseOutput } from './tools/releaseOutput.ts';
import { createRelease } from './tools/release.ts';
import { searchInput } from './tools/searchInput.ts';
import { searchOutput } from './tools/searchOutput.ts';
import { createSearch } from './tools/search.ts';
import type { UnleashClient } from './unleash/client.ts';

export const createServer = (unleash: UnleashClient): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });
  const release = createRelease(unleash);
  const search = createSearch(unleash);

  server.registerTool(
    'release',
    {
      description: 'Release a feature flag to a percentage of users in an environment. Creates the flag if it does not exist.',
      inputSchema: releaseInput,
      outputSchema: releaseOutput,
    },
    async (input) => {
      const result = await release(input);
      return { structuredContent: { result }, isError: result.kind === 'failed', content: [] };
    },
  );

  server.registerTool(
    'search',
    {
      description: 'Look up what is in Unleash: projects, enabled environments, segments, flags, context fields, or the audiences a flag has in an environment. Use it to find the values other tools need.',
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = await search(input);
      return { structuredContent: { result }, isError: result.kind === 'failed', content: [] };
    },
  );

  return server;
};
