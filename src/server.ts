import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { releaseInput } from './tools/releaseInput.ts';
import { releaseOutput } from './tools/releaseOutput.ts';
import { createRelease } from './tools/release.ts';
import { inspectInput } from './tools/inspectInput.ts';
import { inspectOutput } from './tools/inspectOutput.ts';
import { createInspect } from './tools/inspect.ts';
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

  return server;
};
