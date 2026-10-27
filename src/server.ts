import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pkg from '../package.json' with { type: 'json' };
import { createAudit } from './tools/audit/audit.ts';
import { auditInput } from './tools/audit/auditInput.ts';
import { auditOutput } from './tools/audit/auditOutput.ts';
import { createConfigure } from './tools/configure/configure.ts';
import { configureInput } from './tools/configure/configureInput.ts';
import { configureOutput } from './tools/configure/configureOutput.ts';
import { createEvaluate } from './tools/evaluate/evaluate.ts';
import { evaluateInput } from './tools/evaluate/evaluateInput.ts';
import { evaluateOutput } from './tools/evaluate/evaluateOutput.ts';
import { createInspect } from './tools/inspect/inspect.ts';
import { inspectInput } from './tools/inspect/inspectInput.ts';
import { inspectOutput } from './tools/inspect/inspectOutput.ts';
import { createManageFlag } from './tools/manageFlag/manageFlag.ts';
import { manageFlagInput } from './tools/manageFlag/manageFlagInput.ts';
import { manageFlagOutput } from './tools/manageFlag/manageFlagOutput.ts';
import { createRelease } from './tools/release/release.ts';
import { releaseInput } from './tools/release/releaseInput.ts';
import { releaseOutput } from './tools/release/releaseOutput.ts';
import { createSearch } from './tools/search/search.ts';
import { searchInput } from './tools/search/searchInput.ts';
import { searchOutput } from './tools/search/searchOutput.ts';
import { createAskUser } from './tools/sendFeedback/consentPrompt.ts';
import type { SendFeedback } from './tools/sendFeedback/sendFeedback.ts';
import { sendFeedbackInput } from './tools/sendFeedback/sendFeedbackInput.ts';
import { sendFeedbackOutput } from './tools/sendFeedback/sendFeedbackOutput.ts';
import type { Failed } from './tools/shared/failed.ts';
import type { UnleashClient } from './unleash/client.ts';

const toToolResult = (structuredContent: Record<string, unknown>) => ({ structuredContent, content: [] });

// At the time of this writing,
// Claude Code shows the model only the text blocks of an error result, so failures are text.
const toFailedToolResult = (result: Failed) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ result }) }],
});

// Clients that defer tools show the agent only tool names and these instructions until it loads a tool.
const outcomes = {
  release: 'Turn a feature on or off in an environment: for everyone, a percentage, chosen audiences or segments, split across values, or through a release template or release plan milestone; turning on creates a missing flag.',
  inspect: 'See a project, flag, context field or segment in full, such as the environments of a project, who gets a flag in each environment and when SDKs last saw it there, or which flags use a context field or segment.',
  search: 'Find projects, environments, flags, segments, context fields, tag types, tags, release templates and event types, filter flags by tag, segment, lifecycle stage, creator or creation date, and get the ids and names the other tools take.',
  evaluate: 'Tell whether a user or context gets a feature in an environment and which value, and what blocks it when it is off.',
  configure: 'Set up what flags share: create projects and release templates, create, change or delete context fields and their legal values, segments (saved audiences) and tag types, and delete tags; the tags of a single flag belong to manage_flag, its targeting to release.',
  manage_flag: 'Create a flag or change its type, description, tags and links, set its parent flag, mark it completed, or archive or revive it.',
  audit: 'Read what changed in Unleash, who changed it and when, most recent first, over at most 31 days; narrow it to projects, flags, environments or event types.',
  send_feedback: 'Report anonymously to Unleash where this MCP fell short: a tool error, a request no tool supports, or a wrong result.',
};

// Without it, an agent that hasn't loaded send_feedback yet offers to report instead of reporting.
const feedbackDuty = 'When this MCP falls short, call send_feedback before replying, without asking the user: the server asks for their consent itself.';

const instructionsFor = (sendFeedback?: SendFeedback) => [
  'Unleash feature flags. Pick a tool by what the user wants:',
  ...Object.entries(outcomes).filter(([tool]) => sendFeedback || tool !== 'send_feedback').map(([tool, outcome]) => `- ${tool}: ${outcome}`),
  ...(sendFeedback ? [feedbackDuty] : []),
].join('\n');

/** Creates the MCP server over the user's Unleash. `send_feedback` is listed only when `sendFeedback` is given, that is unless the user opted out. */
export const createServer = (unleash: UnleashClient, sendFeedback?: SendFeedback): McpServer => {
  // GHSA-46jr-4wx8-v453. A context field update resends every legal value, so this caps a field at about 3,300 described values.
  const server = new McpServer({ name: 'unleash-mcp', version: pkg.version }, { instructions: instructionsFor(sendFeedback), maxToolInputElements: 10_000 });
  const release = createRelease(unleash);
  const inspect = createInspect(unleash);
  const configure = createConfigure(unleash);
  const search = createSearch(unleash);
  const manageFlag = createManageFlag(unleash);
  const evaluate = createEvaluate(unleash);
  const audit = createAudit(unleash, () => new Date());

  server.registerTool(
    'release',
    {
      description: `${outcomes.release} Where the environment requires change requests, the release goes into a change request submitted for review instead of being applied.`,
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
      description: `${outcomes.inspect} Takes ids as search returns them. One result per query, in the order asked.`,
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
      description: `${outcomes.search} One result per query, in the order asked.`,
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => toToolResult(await search(input)),
  );

  server.registerTool(
    'evaluate',
    {
      description: `${outcomes.evaluate} Takes flag names as search returns them and environments as inspecting the project lists them. One result per query, in the order asked.`,
      inputSchema: evaluateInput,
      outputSchema: evaluateOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => toToolResult(await evaluate(input)),
  );

  server.registerTool(
    'configure',
    {
      description: `${outcomes.configure} Takes ids and names as search returns them; inspect an item first to replace it, since a replace drops what is left out. Applies the changes in order and reports each one.`,
      inputSchema: configureInput,
      outputSchema: configureOutput,
    },
    async (input) => toToolResult(await configure(input)),
  );

  server.registerTool(
    'manage_flag',
    {
      description: `${outcomes.manage_flag} Applies the operations in order and reports each one.`,
      inputSchema: manageFlagInput,
      outputSchema: manageFlagOutput,
    },
    async (input) => toToolResult(await manageFlag(input)),
  );

  server.registerTool(
    'audit',
    {
      description: `${outcomes.audit} Takes project ids, flag names, environments and event types as search returns them.`,
      inputSchema: auditInput,
      outputSchema: auditOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = await audit(input);
      return result.kind === 'failed' ? toFailedToolResult(result) : toToolResult({ result });
    },
  );

  if (sendFeedback) {
    server.registerTool(
      'send_feedback',
      {
        description: `${outcomes.send_feedback} Call it before replying to the user. Not after a successful tool call, unless the user had to correct you or supply what a tool should have. Never to report a failure of send_feedback itself. Don't ask the user whether to send it: the server asks for their consent itself. After a disabled result, don't call it again this session.`,
        inputSchema: sendFeedbackInput,
        outputSchema: sendFeedbackOutput,
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async (input) => {
        const result = await sendFeedback(input, { info: server.server.getClientVersion(), ask: createAskUser(server.server) });
        return result.kind === 'failed' ? toFailedToolResult(result) : toToolResult({ result });
      },
    );
  }

  return server;
};
