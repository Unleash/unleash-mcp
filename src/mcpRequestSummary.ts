import {
  type CallToolResult,
  CallToolResultSchema,
  ClientNotificationSchema,
  ClientRequestSchema,
  InitializeRequestParamsSchema,
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCErrorResponse,
  type JSONRPCMessage,
  type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failed } from './tools/shared/failed.ts';
import { type ToolName, toolNames } from './tools/toolNames.ts';

const toolError = failed.pick({ name: true, status: true });
type ToolError = z.infer<typeof toolError>;
type ResultCounts = { resultKinds: Record<string, number>; errors: ToolError[]; resultBytes: number };

/**
 * `initialize`: the client as it introduced itself, whatever came back.
 * `sdk_error`: the SDK answered instead of a tool, such as an unknown tool, bad arguments or a request it turned away.
 * `no_reply`: the client hung up first.
 * `unreadable`: a body that is not one JSON-RPC request or notification, such as a batch.
 * `resultBytes` counts only the text the agent reads, since a result carries its JSON twice.
 * A method MCP doesn't have is `unknown` and a capability it doesn't know is left out, since the client made them up.
 */
export type McpRequestSummary =
  | { kind: 'initialize'; client: { name: string; version: string }; capabilities: string[] }
  | ({ kind: 'tool_result'; tool: ToolName } & ResultCounts)
  | { kind: 'sdk_error'; tool: ToolName | 'unknown' }
  | { kind: 'no_reply'; tool: ToolName | 'unknown' }
  | { kind: 'other'; method: string }
  | { kind: 'unreadable' };

const toolCall = z.object({ name: z.enum(toolNames) });
const clientMethods = new Set<string>(
  [...ClientRequestSchema.options, ...ClientNotificationSchema.options].map((schema) => schema.shape.method.value),
);
const isResponse = (message: JSONRPCMessage): message is JSONRPCResultResponse | JSONRPCErrorResponse =>
  isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);

export const toMcpRequestSummary = (
  body: unknown,
  replies: JSONRPCMessage[],
  ending: 'replied' | 'hung_up',
): McpRequestSummary | undefined => {
  if (body === undefined) return undefined;
  if (!isJSONRPCRequest(body) && !isJSONRPCNotification(body)) return { kind: 'unreadable' };
  const initialize = body.method === 'initialize' && InitializeRequestParamsSchema.safeParse(body.params).data;
  if (isJSONRPCRequest(body) && initialize) {
    const { clientInfo, capabilities } = initialize;
    return {
      kind: 'initialize',
      client: { name: clientInfo.name, version: clientInfo.version },
      capabilities: Object.keys(capabilities),
    };
  }
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') {
    return { kind: 'other', method: clientMethods.has(body.method) ? body.method : 'unknown' };
  }
  const tool = toolCall.safeParse(body.params).data?.name ?? 'unknown';
  const reply = replies.filter(isResponse).find((response) => response.id === body.id);
  if (!reply) return { kind: ending === 'hung_up' ? 'no_reply' : 'sdk_error', tool };
  if (isJSONRPCErrorResponse(reply)) return { kind: 'sdk_error', tool };
  const result = CallToolResultSchema.safeParse(reply.result);
  const counted = result.success ? countResults(result.data) : undefined;
  return tool !== 'unknown' && counted ? { kind: 'tool_result', tool, ...counted } : { kind: 'sdk_error', tool };
};

const resultItem = z.looseObject({ kind: z.string() });
const resultItems = z.union([
  z.object({ results: z.array(resultItem) }).transform(({ results }) => results),
  z.object({ result: resultItem }).transform(({ result }) => [result]),
]);
const failedItem = z.union([
  failed.pick({ kind: true, name: true, status: true }),
  z.object({ kind: z.literal('failed'), error: toolError }).transform(({ error }) => error),
]);

const countResults = (result: CallToolResult): ResultCounts | undefined => {
  // The SDK's own errors carry no structured content.
  const items = resultItems.safeParse(result.structuredContent).data;
  if (!items) return undefined;
  const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  const resultBytes = Buffer.byteLength(text);
  const resultKinds: Record<string, number> = {};
  for (const item of items) {
    resultKinds[item.kind] = (resultKinds[item.kind] ?? 0) + 1;
  }
  const errors = items.flatMap((item) => {
    const read = failedItem.safeParse(item);
    return read.success ? [{ name: read.data.name, status: read.data.status }] : [];
  });
  return { resultKinds, errors, resultBytes };
};
