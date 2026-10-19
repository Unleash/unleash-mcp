import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { outputSchema, present, presentationInput } from './tools/present.ts';
import { release, releaseInput } from './tools/release.ts';
import type { UnleashClient } from './unleash/client.ts';

export const createServer = (unleash: UnleashClient): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });
  server.registerTool(
    'release',
    {
      description:
        'Release a feature flag to an audience in an environment. Each target is one audience (percentage, constraints, segments, optional value). ' +
        'Updates existing strategies in place and enables the environment, or opens a change request when required. ' +
        'When something is missing or invalid the tool writes nothing and returns decisions: fix the input and call again, ' +
        'or for a confirmation call again with its id in `confirm`. A pending change request is a draft until submitted with the change_requests tool.',
      inputSchema: { ...releaseInput, ...presentationInput },
      outputSchema,
    },
    async ({ search, page, ...input }) => present(await release(unleash, input), { search, page }),
  );
  return server;
};
