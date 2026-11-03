import {
  type CallToolResult,
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCErrorResponse,
  type JSONRPCMessage,
  type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failed, readFailedToolResult } from './tools/shared/failed.ts';
import { type ToolName, toolNames } from './tools/toolNames.ts';

const toolError = failed.pick({ name: true, status: true });
type ToolError = z.infer<typeof toolError>;
type ToolResult = { results: number; errors: ToolError[]; resultBytes: number };

/**
 * `sdk_error`: the SDK answered instead of a tool, such as an unknown tool, bad arguments or a request it turned away.
 * `no_reply`: the client hung up first.
 * `resultBytes` counts only the text the agent reads, since a success carries its JSON twice.
 * `tool` is left out for a name this server doesn't have, since the client made it up.
 */
export type McpRequestSummary =
  | ({ kind: 'tool_result'; tool: ToolName } & ToolResult)
  | { kind: 'sdk_error'; tool?: ToolName }
  | { kind: 'no_reply'; tool?: ToolName };

const toolCall = z.object({ name: z.enum(toolNames) });
const isResponse = (message: JSONRPCMessage): message is JSONRPCResultResponse | JSONRPCErrorResponse =>
  isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);

export const toMcpRequestSummary = (
  body: unknown,
  replies: JSONRPCMessage[],
  ending: 'replied' | 'hung_up',
): McpRequestSummary | undefined => {
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') return undefined;
  const tool = toolCall.safeParse(body.params).data?.name;
  const named = tool ? { tool } : {};
  const reply = replies.filter(isResponse).find((response) => response.id === body.id);
  if (!reply) return { kind: ending === 'hung_up' ? 'no_reply' : 'sdk_error', ...named };
  if (isJSONRPCErrorResponse(reply)) return { kind: 'sdk_error', ...named };
  const result = CallToolResultSchema.safeParse(reply.result);
  const counted = result.success ? countResults(result.data) : undefined;
  return tool && counted ? { kind: 'tool_result', tool, ...counted } : { kind: 'sdk_error', ...named };
};

const resultList = z.object({ results: z.array(z.unknown()) });
const failedItem = z.union([
  failed.pick({ kind: true, name: true, status: true }),
  z.object({ kind: z.literal('failed'), error: toolError }).transform(({ error }) => error),
]);

const countResults = (result: CallToolResult): ToolResult | undefined => {
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  const resultBytes = Buffer.byteLength(text);
  if (result.isError) {
    const error = readFailedToolResult(text);
    return error && { results: 1, errors: [{ name: error.name, status: error.status }], resultBytes };
  }
  const items = resultList.safeParse(result.structuredContent).data?.results ?? [result.structuredContent];
  const errors = items.flatMap((item) => {
    const read = failedItem.safeParse(item);
    return read.success ? [{ name: read.data.name, status: read.data.status }] : [];
  });
  return { results: items.length, errors, resultBytes };
};
