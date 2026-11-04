import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

// The agent runs from an empty directory, so nothing of this repo (CLAUDE.md, rules, memory) reaches its context and
// biases how it uses the tools; the server is this working tree's source, by absolute path.
const repo = join(import.meta.dirname, '..');
const mcpConfig = JSON.stringify({
  mcpServers: {
    'unleash-dev': {
      command: 'node',
      args: [`--env-file-if-exists=${join(repo, '.env')}`, join(repo, 'src/index.ts')],
    },
  },
});

const flags = [
  '--print',
  '--model',
  'haiku',
  '--output-format',
  'stream-json',
  '--verbose',
  '--mcp-config',
  mcpConfig,
  '--strict-mcp-config',
  '--tools',
  '',
  '--allowedTools',
  'mcp__unleash-dev',
  '--permission-mode',
  'dontAsk',
  '--no-session-persistence',
];

export type Run = {
  answer: string;
  turns: number;
  toolCalls: number;
  /** Tool results that carry a failure, whether the whole call failed or one query in it. */
  toolErrors: number;
  /** The failed tool results, with the tool that answered. */
  failures: { tool: string; text: string }[];
  /** Each tool call in order, with the estimated tokens of its result. */
  calls: { tool: string; tokens: number }[];
  /** Tokens of every tool result, what the server itself puts into the agent's context, estimated at 4 characters each. */
  toolResultTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  seconds: number;
};

type Block = {
  type: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | { text?: string }[];
};
type Event = {
  type: string;
  message?: { content: Block[] };
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

// A tool result is text: one string, or text blocks.
const textOf = ({ content }: Block): string =>
  typeof content === 'string' ? content : (content ?? []).map((block) => block.text ?? '').join('');

const tokensOf = (block: Block): number => Math.ceil(textOf(block).length / 4);

const failed = (block: Block): boolean => block.is_error === true || textOf(block).includes('"kind":"failed"');

const toRun = (events: Event[]): Run => {
  const blocks = events.flatMap((event) => event.message?.content ?? []);
  const calls = blocks.filter((block) => block.type === 'tool_use');
  const results = blocks.filter((block) => block.type === 'tool_result');
  const toolOf = (result: Block) => calls.find((call) => call.id === result.tool_use_id)?.name ?? 'unknown';
  const result = events.find((event) => event.type === 'result');
  if (!result?.usage) throw new Error(`no result event: ${JSON.stringify(events.at(-1))}`);
  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens } = result.usage;
  return {
    answer: result.result ?? '',
    turns: result.num_turns ?? 0,
    toolCalls: calls.length,
    toolErrors: results.filter(failed).length,
    failures: results.filter(failed).map((result) => ({ tool: toolOf(result), text: textOf(result) })),
    calls: results.map((result) => ({ tool: toolOf(result), tokens: tokensOf(result) })),
    toolResultTokens: results.reduce((sum, block) => sum + tokensOf(block), 0),
    inputTokens: input_tokens + cache_creation_input_tokens + cache_read_input_tokens,
    outputTokens: output_tokens,
    costUsd: result.total_cost_usd ?? 0,
    seconds: (result.duration_ms ?? 0) / 1000,
  };
};

const describe = (run: Run): string =>
  [
    `turns ${run.turns}`,
    `tool calls ${run.toolCalls}`,
    `tool errors ${run.toolErrors}`,
    `tool results ~${run.toolResultTokens} tokens`,
    `tokens ${run.inputTokens} in / ${run.outputTokens} out`,
    `$${run.costUsd.toFixed(4)}`,
    `${run.seconds.toFixed(1)}s`,
  ].join(', ');

/**
 * Runs Claude Code headless on a prompt, with this repo's MCP server as its only tools, and returns its final answer
 * with what the run cost, which it also reports on the test.
 */
export const runAgent = (t: TestContext, prompt: string): Promise<Run> =>
  new Promise((resolve, reject) => {
    const claude = spawn('claude', [...flags, prompt], {
      cwd: mkdtempSync(join(tmpdir(), 'unleash-mcp-eval-')),
      env: { ...process.env, UNLEASH_MCP_SEND_FEEDBACK: 'false' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    claude.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    claude.on('error', reject);
    claude.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exited with ${code}: ${stdout}`));
      const run = toRun(
        stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      );
      t.diagnostic(describe(run));
      t.diagnostic(
        `calls: ${run.calls.map(({ tool, tokens }) => `${tool.replace('mcp__unleash-dev__', '')} ~${tokens}`).join(', ')}`,
      );
      for (const { tool, text } of run.failures) t.diagnostic(`${tool} failed: ${text}`);
      resolve(run);
    });
  });

const writingTools = ['release', 'experiment', 'kill_switch', 'configure', 'manage_flag'].map(
  (tool) => `mcp__unleash-dev__${tool}`,
);

export type Budget = {
  /** The most tool calls a good run needs, from the worst pass seen. */
  toolCalls: number;
  /** The most tokens of tool results a good run reads, from the worst pass seen. */
  toolResultTokens: number;
};

/**
 * Checks a run against the budget of its journey: no write was refused (a lookup may fail, such as a check whether a
 * flag exists before creating it), and the agent read and called no more than a good run needs.
 */
export const assertWithinBudget = (run: Run, budget: Budget): void => {
  const refused = run.failures.filter(({ tool }) => writingTools.includes(tool));
  assert.deepEqual(refused, [], 'a write was refused');
  assert.ok(run.toolCalls <= budget.toolCalls, `${run.toolCalls} tool calls, budget ${budget.toolCalls}`);
  assert.ok(
    run.toolResultTokens <= budget.toolResultTokens,
    `~${run.toolResultTokens} tokens of tool results, budget ${budget.toolResultTokens}`,
  );
};
