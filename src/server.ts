import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { releaseInput } from './tools/release/releaseInput.ts';
import { releaseOutput } from './tools/release/releaseOutput.ts';
import { createRelease } from './tools/release/release.ts';
import { inspectInput } from './tools/inspect/inspectInput.ts';
import { inspectOutput } from './tools/inspect/inspectOutput.ts';
import { createInspect } from './tools/inspect/inspect.ts';
import { configureInput } from './tools/configure/configureInput.ts';
import { configureOutput } from './tools/configure/configureOutput.ts';
import { createConfigure } from './tools/configure/configure.ts';
import { searchInput } from './tools/search/searchInput.ts';
import { searchOutput } from './tools/search/searchOutput.ts';
import { createSearch } from './tools/search/search.ts';
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
  const inspect = createInspect(unleash);
  const configure = createConfigure(unleash);
  const search = createSearch(unleash);

  server.registerTool(
    'release',
    {
      description: 'Release a feature flag to audiences in an environment, or turn it off, optionally splitting an audience across values by share. Turning on creates the flag if it does not exist. Where the environment requires change requests, the release goes into a change request submitted for review instead of being applied.',
      inputSchema: releaseInput,
      outputSchema: releaseOutput,
    },
    async (input) => {
      return toToolResult(await release(input));
    },
  );

  // Each query answers its own failure inside the results, so the inspect as a whole never fails.
  server.registerTool(
    'inspect',
    {
      description: 'Read Unleash items in full by their ids. One result per query, in the order asked.',
      inputSchema: inspectInput,
      outputSchema: inspectOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => ({ structuredContent: await inspect(input), content: [] }),
  );

  // Each query answers its own failure inside the results, so the search as a whole never fails.
  server.registerTool(
    'search',
    {
      description: 'Find Unleash items by name and get the ids inspect and release take. One result per query, in the order asked.',
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => ({ structuredContent: await search(input), content: [] }),
  );

  server.registerTool(
    'configure',
    {
      description: 'Change Unleash configuration: create, replace and delete context fields, global or in a project, add or remove their legal values, and create release templates. Applies the changes in order and reports each one.',
      inputSchema: configureInput,
      outputSchema: configureOutput,
    },
    async (input) => {
      return { structuredContent: await configure(input), content: [] };
    },
  );

  return server;
};
