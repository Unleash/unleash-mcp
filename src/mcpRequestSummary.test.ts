import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toMcpRequestSummary } from './mcpRequestSummary.ts';

const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: {} } } as const;

test('marks a tool reply it cannot read as unreadable', () => {
  const reply = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'unknown' }] } } as const;

  assert.deepEqual(toMcpRequestSummary(call, [reply]), { kind: 'unreadable', tool: 'search' });
});

test('marks a call the SDK rejects with a JSON-RPC error as a protocol error', () => {
  const reply = { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params' } } as const;

  assert.deepEqual(toMcpRequestSummary(call, [reply]), { kind: 'protocol_error', tool: 'search' });
});
