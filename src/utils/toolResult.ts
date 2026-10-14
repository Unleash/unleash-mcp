import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Clients disagree on which field they pass to the model, so the full payload goes in both
// structuredContent and a JSON text block, as the MCP spec recommends.
export function jsonResult(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}
