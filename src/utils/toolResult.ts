import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// One compact JSON text block and no structuredContent: clients disagree on which of the two
// they pass to the model, so a single payload gives the model the same data in every client.
export function jsonResult(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}
