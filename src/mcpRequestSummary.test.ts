import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toMcpRequestSummary } from './mcpRequestSummary.ts';
import { toFailedToolResult } from './tools/shared/failed.ts';

const toolCallRequest = (name: string) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: {} },
});
const summaryOf = (tool: string, result: CallToolResult) =>
  toMcpRequestSummary(toolCallRequest(tool), [{ jsonrpc: '2.0', id: 1, result }], 'replied');
const toolResult = (structuredContent: Record<string, unknown>): CallToolResult => ({
  structuredContent,
  content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
});

test('leaves out a request that is not a tool call', () => {
  const summary = toMcpRequestSummary({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, [], 'replied');

  assert.equal(summary, undefined);
});

test('summarises a tool call the client hangs up on as no reply', () => {
  const summary = toMcpRequestSummary(toolCallRequest('audit'), [], 'hung_up');

  assert.deepEqual(summary, { kind: 'no_reply', tool: 'audit' });
});

test('summarises a tool call the SDK turns away without a reply as an SDK error', () => {
  const summary = toMcpRequestSummary(toolCallRequest('audit'), [], 'replied');

  assert.deepEqual(summary, { kind: 'sdk_error', tool: 'audit' });
});

test('summarises a call to a tool this server lacks under the tool unknown', () => {
  const summary = toMcpRequestSummary(toolCallRequest('no_such_tool'), [], 'replied');

  assert.deepEqual(summary, { kind: 'sdk_error', tool: 'unknown' });
});

test("summarises the SDK's own error text for a tool as an SDK error", () => {
  const summary = summaryOf('audit', { isError: true, content: [{ type: 'text', text: 'Input validation error' }] });

  assert.deepEqual(summary, { kind: 'sdk_error', tool: 'audit' });
});

test('counts a failed tool by the error Unleash answered with', () => {
  const failed = toFailedToolResult({ kind: 'failed', status: 403, name: 'NoAccessError', reasons: [] });

  const summary = summaryOf('audit', failed);

  assert.partialDeepStrictEqual(summary, {
    kind: 'tool_result',
    results: 1,
    errors: [{ name: 'NoAccessError', status: 403 }],
  });
});

test('counts a single result as one, measuring its text in bytes, not characters', () => {
  const summary = summaryOf('release', toolResult({ result: { kind: 'released', flag: 'crème-brûlée' } }));

  assert.deepEqual(summary, { kind: 'tool_result', tool: 'release', results: 1, errors: [], resultBytes: 55 });
});

test('counts each result of a list, naming the plain failures and the failed changes', () => {
  const summary = summaryOf(
    'configure',
    toolResult({
      results: [
        { kind: 'projects', projects: [] },
        { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [] },
        { kind: 'failed', name: 'beta-users', error: { status: 409, name: 'NameExistsError', reasons: [] } },
      ],
    }),
  );

  assert.partialDeepStrictEqual(summary, {
    results: 3,
    errors: [
      { name: 'NotFoundError', status: 404 },
      { name: 'NameExistsError', status: 409 },
    ],
  });
});
