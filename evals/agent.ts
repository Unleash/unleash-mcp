import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import type { TestContext } from 'node:test';
import { type Run, report } from './run.ts';

const serverName = 'unleash-dev';

// The server is this working tree's source, by absolute path, so an edit is evaluated at once. Feedback stays off so
// an eval never reports to Unleash's own instance, whatever the developer's .env says.
const repo = join(import.meta.dirname, '..');
const mcpConfig = JSON.stringify({
  mcpServers: {
    [serverName]: {
      command: 'node',
      args: [`--env-file-if-exists=${join(repo, '.env')}`, join(repo, 'src/index.ts')],
      env: { UNLEASH_MCP_SEND_FEEDBACK: 'false' },
    },
  },
});

// The agent gets none of this repo's or the user's Claude Code context (CLAUDE.md, rules, memory, hooks, skills), which
// would bias how it uses the tools and differ between machines. It runs from an empty directory for the same reason.
const claudeArgs = [
  '--print',
  '--model',
  'haiku',
  '--output-format',
  'stream-json',
  '--verbose',
  '--setting-sources',
  '',
  '--disable-slash-commands',
  '--mcp-config',
  mcpConfig,
  '--strict-mcp-config',
  '--tools',
  '',
  '--allowedTools',
  `mcp__${serverName}`,
  '--permission-mode',
  'dontAsk',
  '--no-session-persistence',
];

// Claude Code prints one JSON line per event. The first says which MCP servers connected, a message line carries content
// blocks (text, a tool call or a tool result), and the last line sums the run up. Both types list only the fields the
// evals read.
type ContentBlock = {
  type: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | { text?: string }[];
};
type OutputLine = {
  type: string;
  subtype?: string;
  mcp_servers?: { name: string; status: string }[];
  model?: string;
  message?: { content: ContentBlock[] };
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
};

const textOf = ({ content }: ContentBlock): string =>
  typeof content === 'string' ? content : (content ?? []).map((block) => block.text ?? '').join('');

const tokensOf = (block: ContentBlock): number => Math.ceil(textOf(block).length / 4);

const isFailure = (block: ContentBlock): boolean =>
  block.is_error === true || textOf(block).includes('"kind":"failed"');

export const parseClaudeOutput = (stdout: string): Run => {
  const lines: OutputLine[] = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const init = lines.find((line) => line.type === 'system' && line.subtype === 'init');
  const server = init?.mcp_servers?.find(({ name }) => name === serverName);
  if (!init || server?.status !== 'connected') {
    throw new Error(`${serverName} did not connect: ${JSON.stringify(server)}`);
  }
  const summary = lines.find((line) => line.type === 'result');
  if (!summary?.usage) throw new Error(`no result line: ${JSON.stringify(lines.at(-1))}`);
  if (summary.is_error || summary.subtype !== 'success') throw new Error(`run ${summary.subtype}: ${summary.result}`);

  const blocks = lines.flatMap((line) => line.message?.content ?? []);
  const toolNameById = new Map(
    blocks
      .filter((block) => block.type === 'tool_use')
      .map((call) => [call.id, (call.name ?? '').replace(`mcp__${serverName}__`, '')]),
  );
  const toolResults = blocks.filter((block) => block.type === 'tool_result');
  const toolOf = (block: ContentBlock): string => {
    const name = toolNameById.get(block.tool_use_id);
    if (name === undefined) throw new Error(`no tool call for ${block.tool_use_id}`);
    return name;
  };
  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens } = summary.usage;
  return {
    model: init.model ?? '',
    answer: summary.result ?? '',
    turns: summary.num_turns ?? 0,
    toolCalls: toolNameById.size,
    failures: toolResults.filter(isFailure).map((block) => ({ tool: toolOf(block), text: textOf(block) })),
    calls: toolResults.map((block) => ({ tool: toolOf(block), tokens: tokensOf(block) })),
    toolResultTokens: toolResults.reduce((sum, block) => sum + tokensOf(block), 0),
    inputTokens: input_tokens + cache_creation_input_tokens + cache_read_input_tokens,
    outputTokens: output_tokens,
    costUsd: summary.total_cost_usd ?? 0,
    seconds: (summary.duration_ms ?? 0) / 1000,
  };
};

export const runAgent = async (t: TestContext, prompt: string): Promise<Run> => {
  const cwd = mkdtempSync(join(tmpdir(), 'unleash-mcp-eval-'));
  try {
    const claude = spawn('claude', [...claudeArgs, prompt], {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
      signal: t.signal,
    });
    const [stdout, [code, signal]] = await Promise.all([text(claude.stdout), once(claude, 'close')]);
    if (code !== 0) throw new Error(`claude exited with ${code ?? signal}: ${stdout.trim().split('\n').at(-1)}`);
    const run = parseClaudeOutput(stdout);
    report(t, run);
    return run;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
};
