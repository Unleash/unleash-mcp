import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMcpRequestSummary } from './mcpRequestSummary.ts';

test('marks a call the SDK rejects with a JSON-RPC error as an SDK error', () => {
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: {} } } as const;
  const reply = { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } } as const;

  assert.deepEqual(toMcpRequestSummary(call, [reply], 'replied'), { kind: 'sdk_error', tool: 'search' });
});
