import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function payloadOf<T = Record<string, unknown>>(result: unknown): T {
  const [block] = (result as CallToolResult).content;
  if (block?.type !== 'text') throw new Error('Expected a text result');
  return JSON.parse(block.text);
}
