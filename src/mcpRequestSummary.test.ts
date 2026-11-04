import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CallToolResult, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { toMcpRequestSummary } from './mcpRequestSummary.ts';
import { toFailedToolResult } from './tools/shared/failed.ts';

const toolCallRequest = (name: string) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: {} },
});
const answer = (result: CallToolResult): JSONRPCMessage => ({ jsonrpc: '2.0', id: 1, result });
const toolResult = (structuredContent: Record<string, unknown>) => ({
  structuredContent,
  content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
});
const sdkError = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });

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

test('names a tool this server does not have unknown', () => {
  const summary = toMcpRequestSummary(
    toolCallRequest('no_such_tool'),
    [answer(sdkError('Tool no_such_tool not found'))],
    'replied',
  );

  assert.deepEqual(summary, { kind: 'sdk_error', tool: 'unknown' });
});

test("summarises the SDK's own error text for a tool as an SDK error", () => {
  const summary = toMcpRequestSummary(
    toolCallRequest('audit'),
    [answer(sdkError('Input validation error: Invalid arguments for tool audit'))],
    'replied',
  );

  assert.deepEqual(summary, { kind: 'sdk_error', tool: 'audit' });
});

test('counts a failed tool by the error Unleash answered with', () => {
  const failed = toFailedToolResult({ kind: 'failed', status: 403, name: 'NoAccessError', reasons: ['secret-launch'] });

  const summary = toMcpRequestSummary(toolCallRequest('audit'), [answer(failed)], 'replied');

  assert.deepEqual(summary, {
    kind: 'tool_result',
    tool: 'audit',
    results: 1,
    errors: [{ name: 'NoAccessError', status: 403 }],
    resultBytes: failed.content[0].text.length,
  });
});

test('counts a single result as one, with the bytes of its text only', () => {
  const released = toolResult({ result: { kind: 'released', flag: 'crème-brûlée' } });

  const summary = toMcpRequestSummary(toolCallRequest('release'), [answer(released)], 'replied');

  assert.deepEqual(summary, { kind: 'tool_result', tool: 'release', results: 1, errors: [], resultBytes: 55 });
});

test('counts each result of a list, naming the ones that failed', () => {
  const found = toolResult({
    results: [
      { kind: 'projects', projects: [] },
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [] },
    ],
  });

  const summary = toMcpRequestSummary(toolCallRequest('search'), [answer(found)], 'replied');

  assert.deepEqual(summary, {
    kind: 'tool_result',
    tool: 'search',
    results: 2,
    errors: [{ name: 'NotFoundError', status: 404 }],
    resultBytes: found.content[0].text.length,
  });
});

test('reads the error of a change that names what it changed', () => {
  const configured = toolResult({
    results: [
      {
        kind: 'failed',
        resource: 'segment',
        action: 'create',
        name: 'beta-users',
        error: { status: 409, name: 'NameExistsError', reasons: [] },
      },
    ],
  });

  const summary = toMcpRequestSummary(toolCallRequest('configure'), [answer(configured)], 'replied');

  assert.deepEqual(summary, {
    kind: 'tool_result',
    tool: 'configure',
    results: 1,
    errors: [{ name: 'NameExistsError', status: 409 }],
    resultBytes: configured.content[0].text.length,
  });
});
