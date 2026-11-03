import {
  CallToolRequestParamsSchema,
  type CallToolResult,
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failed, readFailedToolResult } from './tools/shared/failed.ts';
import { type ToolName, toolNames } from './tools/toolNames.ts';

const toolError = failed.pick({ name: true, status: true });
type ToolError = z.infer<typeof toolError>;
type ToolResult = { results: number; errors: ToolError[]; resultBytes: number };

/**
 * `protocol_error` is the SDK answering instead of a tool: an unknown tool, invalid arguments or a tool that threw.
 * `no_reply` is the client hanging up before the tool replied.
 * `resultBytes` counts only the text the agent reads, since a success carries its JSON twice.
 * A name that is not one of this server's tools came from the client, so it never leaves the package.
 */
export type McpRequestSummary =
  | ({ kind: 'tool_result'; tool: ToolName } & ToolResult)
  | { kind: 'protocol_error'; tool?: ToolName }
  | { kind: 'no_reply'; tool?: ToolName }
  | { kind: 'unreadable'; tool?: ToolName };

const toolName = CallToolRequestParamsSchema.pick({ name: true });
const isToolName = (name: string): name is ToolName => toolNames.some((known) => known === name);

export const toMcpRequestSummary = (body: unknown, replies: JSONRPCMessage[]): McpRequestSummary | undefined => {
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') return undefined;
  const name = toolName.safeParse(body.params).data?.name;
  const tool = name && isToolName(name) ? name : undefined;
  const named = tool ? { tool } : {};
  const reply = replies.find((r) => 'id' in r && r.id === body.id);
  if (!reply) return { kind: 'no_reply', ...named };
  // The SDK replies with a JSON-RPC error when the call's params are malformed, such as a missing tool name.
  if (isJSONRPCErrorResponse(reply)) return { kind: 'protocol_error', ...named };
  const result = CallToolResultSchema.safeParse(isJSONRPCResultResponse(reply) ? reply.result : undefined);
  if (!result.success) return { kind: 'unreadable', ...named };
  const toolResult = toToolResult(result.data);
  return tool && toolResult ? { kind: 'tool_result', tool, ...toolResult } : { kind: 'protocol_error', ...named };
};

const batch = z.object({ results: z.array(z.unknown()) });
const failedItem = z.union([
  failed.pick({ kind: true, name: true, status: true }),
  z.object({ kind: z.literal('failed'), error: toolError }).transform(({ error }) => error),
]);

// A tool that answers once counts as a batch of one.
const toToolResult = (result: CallToolResult): ToolResult | undefined => {
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  const resultBytes = Buffer.byteLength(text);
  if (result.isError) {
    const error = readFailedToolResult(text);
    return error && { results: 1, errors: [{ name: error.name, status: error.status }], resultBytes };
  }
  const items = batch.safeParse(result.structuredContent).data?.results ?? [result.structuredContent];
  const errors = items.flatMap((item) => {
    const read = failedItem.safeParse(item);
    return read.success ? [{ name: read.data.name, status: read.data.status }] : [];
  });
  return { results: items.length, errors, resultBytes };
};
