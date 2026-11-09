import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClaudeOutput } from './agent.ts';

// Trimmed to the fields the evals read. Result texts are 8 characters, so each counts as 2 tokens.
const connected = {
  type: 'system',
  subtype: 'init',
  mcp_servers: [{ name: 'unleash-dev', status: 'connected' }],
  model: 'claude-haiku-5-5',
};
const calls = {
  type: 'assistant',
  message: {
    content: [
      { type: 'tool_use', id: 'toolu_1', name: 'mcp__unleash-dev__inspect' },
      { type: 'tool_use', id: 'toolu_2', name: 'mcp__unleash-dev__search' },
    ],
  },
};
const results = {
  type: 'user',
  message: {
    content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: '{"a":1}\n' }] },
      { type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'timeout.' },
    ],
  },
};
const answer = { type: 'assistant', message: { content: [{ type: 'text', text: 'development, production' }] } };
const summary = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'development, production',
  num_turns: 3,
  total_cost_usd: 0.0021,
  duration_ms: 3900,
  usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 7 },
};
const output = (...lines: object[]) => `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;

test('reads a run from what Claude Code prints', () => {
  assert.deepEqual(parseClaudeOutput(output(connected, calls, results, answer, summary)), {
    model: 'claude-haiku-5-5',
    answer: 'development, production',
    turns: 3,
    toolCalls: 2,
    failures: [{ tool: 'search', text: 'timeout.' }],
    calls: [
      { tool: 'inspect', tokens: 2 },
      { tool: 'search', tokens: 2 },
    ],
    toolResultTokens: 4,
    inputTokens: 60,
    outputTokens: 7,
    costUsd: 0.0021,
    seconds: 3.9,
  });
});

test('counts a tool result that reports a failed query as a failure', () => {
  const failedQuery = {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"kind":"failed","status":404}' }],
    },
  };

  const run = parseClaudeOutput(output(connected, calls, failedQuery, summary));

  assert.deepEqual(run.failures, [{ tool: 'inspect', text: '{"kind":"failed","status":404}' }]);
});

test('refuses a run whose server did not connect', () => {
  const failed = { ...connected, mcp_servers: [{ name: 'unleash-dev', status: 'failed' }] };

  assert.throws(() => parseClaudeOutput(output(failed, summary)), { message: /unleash-dev did not connect/ });
});

test('refuses a run that ended in an error', () => {
  const errored = { ...summary, subtype: 'error_max_turns', is_error: true, result: undefined };

  assert.throws(() => parseClaudeOutput(output(connected, errored)), { message: 'run error_max_turns: undefined' });
});
