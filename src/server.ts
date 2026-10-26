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
import { manageFlagInput } from './tools/manageFlag/manageFlagInput.ts';
import { manageFlagOutput } from './tools/manageFlag/manageFlagOutput.ts';
import { createManageFlag } from './tools/manageFlag/manageFlag.ts';
import { evaluateInput } from './tools/evaluate/evaluateInput.ts';
import { evaluateOutput } from './tools/evaluate/evaluateOutput.ts';
import { createEvaluate } from './tools/evaluate/evaluate.ts';
import type { Failed } from './tools/shared/failed.ts';
import type { UnleashClient } from './unleash/client.ts';

const toToolResult = (structuredContent: Record<string, unknown>) => ({ structuredContent, content: [] });

// At the time of this writing,
// Claude Code shows the model only the text blocks of an error result, so failures are text.
const toFailedToolResult = (result: Failed) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ result }) }],
});

export const createServer = (unleash: UnleashClient): McpServer => {
  // GHSA-46jr-4wx8-v453. A context field update resends every legal value, so this caps a field at about 3,300 described values.
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version }, { maxToolInputElements: 10_000 });
  const release = createRelease(unleash);
  const inspect = createInspect(unleash);
  const configure = createConfigure(unleash);
  const search = createSearch(unleash);
  const manageFlag = createManageFlag(unleash);
  const evaluate = createEvaluate(unleash);

  server.registerTool(
    'release',
    {
      description: 'Release a feature flag in an environment to audiences, optionally splitting an audience across values by share, or through a release template, or turn it off. Turning on creates the flag if it does not exist. Where the environment requires change requests, the release goes into a change request submitted for review instead of being applied.',
      inputSchema: releaseInput,
      outputSchema: releaseOutput,
    },
    async (input) => {
      const result = await release(input);
      return result.kind === 'failed' ? toFailedToolResult(result) : toToolResult({ result });
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
    async (input) => toToolResult(await inspect(input)),
  );

  // Each query answers its own failure inside the results, so the search as a whole never fails.
  server.registerTool(
    'search',
    {
      description: 'Find Unleash items by name and get the ids inspect, release and configure take. One result per query, in the order asked.',
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => toToolResult(await search(input)),
  );

  server.registerTool(
    'evaluate',
    {
      description: 'Tell whether a feature is on, off or unknown for a context in an environment, such as whether a user gets it. Takes flag names as search returns them and environments as inspecting the project lists them. One result per query, in the order asked.',
      inputSchema: evaluateInput,
      outputSchema: evaluateOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => toToolResult(await evaluate(input)),
  );

  server.registerTool(
    'configure',
    {
      description: 'Change Unleash configuration: context fields and their legal values, segments, tag types and tags, and release templates. Takes ids and names as search returns them; inspect an item first to replace it, since a replace drops what is left out. Applies the changes in order and reports each one.',
      inputSchema: configureInput,
      outputSchema: configureOutput,
    },
    async (input) => toToolResult(await configure(input)),
  );

  server.registerTool(
    'manage_flag',
    {
      description: 'Manage flags: define them (create, or bring an existing one to what is listed), set their parent dependency, mark them completed, archive, revive and delete them. Applies the operations in order and reports each one.',
      inputSchema: manageFlagInput,
      outputSchema: manageFlagOutput,
    },
    async (input) => toToolResult(await manageFlag(input)),
  );

  return server;
};
