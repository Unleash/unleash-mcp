import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { releaseInput } from './tools/releaseInput.ts';
import { releaseOutput } from './tools/releaseOutput.ts';
import { createRelease } from './tools/release.ts';
import { configureInput } from './tools/configureInput.ts';
import { configureOutput } from './tools/configureOutput.ts';
import { createConfigure } from './tools/configure.ts';
import { searchSpikeInput } from './tools/searchSpikeInput.ts';
import { searchSpikeOutput } from './tools/searchSpikeOutput.ts';
import { createSearchSpike } from './tools/searchSpike.ts';
import type { UnleashClient } from './unleash/client.ts';

// At the time of this writing, 
// Claude Code shows the model only the text blocks of an error result, so failures are text.
const toToolResult = <T extends { kind: string }>(result: T) =>
  result.kind === 'failed'
    ? { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ result }) }] }
    : { structuredContent: { result }, content: [] };

export const createServer = (unleash: UnleashClient): McpServer => {
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version });
  const release = createRelease(unleash);
  const searchSpike = createSearchSpike(unleash);
  const configure = createConfigure(unleash);

  server.registerTool(
    'release',
    {
      description: 'Release a feature flag to audiences in an environment, optionally splitting an audience across values by share. Creates the flag if it does not exist. Where the environment requires change requests, the release goes into a change request submitted for review instead of being applied.',
      inputSchema: releaseInput,
      outputSchema: releaseOutput,
    },
    async (input) => {
      return toToolResult(await release(input));
    },
  );

  server.registerTool(
    'search_spike',
    {
      description: 'Look up what is in Unleash: projects, enabled environments, segments, flags, context fields, or the audiences a flag has in an environment. Use it to find the values other tools need.',
      inputSchema: searchSpikeInput,
      outputSchema: searchSpikeOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      return toToolResult(await searchSpike(input));
    },
  );

  server.registerTool(
    'configure',
    {
      description: 'Change Unleash configuration: create, replace and delete global context fields, and add or remove their legal values. Applies the changes in order and reports each one.',
      inputSchema: configureInput,
      outputSchema: configureOutput,
    },
    async (input) => {
      return { structuredContent: await configure(input), content: [] };
    },
  );

  return server;
};
