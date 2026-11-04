import {
  type CallToolResult,
  CallToolResultSchema,
  ClientNotificationSchema,
  ClientRequestSchema,
  type InitializeRequestParams,
  InitializeRequestParamsSchema,
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCErrorResponse,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failed, readFailedToolResult } from './tools/shared/failed.ts';
import { type ToolName, toolNames } from './tools/toolNames.ts';

const toolError = failed.pick({ name: true, status: true });
type ToolError = z.infer<typeof toolError>;
type ToolResult = { results: number; errors: ToolError[]; resultBytes: number };

/**
 * `initialize`: the client as it introduced itself, whatever came back.
 * `sdk_error`: the SDK answered instead of a tool, such as an unknown tool, bad arguments or a request it turned away.
 * `no_reply`: the client hung up first.
 * `unreadable`: a body that is not one JSON-RPC request or notification, such as a batch.
 * `resultBytes` counts only the text the agent reads, since a success carries its JSON twice.
 * A method MCP doesn't have is `unknown` and a capability or extension MCP doesn't know is left out, since the client made them up.
 */
export type McpRequestSummary =
  | { kind: 'initialize'; client: { name: string; version: string }; capabilities: string[]; extensions: string[] }
  | ({ kind: 'tool_result'; tool: ToolName } & ToolResult)
  | { kind: 'sdk_error'; tool: ToolName | 'unknown' }
  | { kind: 'no_reply'; tool: ToolName | 'unknown' }
  | { kind: 'other'; method: string }
  | { kind: 'unreadable' };

const toolCall = z.object({ name: z.enum(toolNames) });
const clientMethods = new Set<string>(
  [...ClientRequestSchema.options, ...ClientNotificationSchema.options].map((schema) => schema.shape.method.value),
);
// The SDK keeps extensions as a free record, so only the ones MCP publishes are known.
const knownExtensions = new Set(['io.modelcontextprotocol/ui']);
const isResponse = (message: JSONRPCMessage): message is JSONRPCResultResponse | JSONRPCErrorResponse =>
  isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);

export const toMcpRequestSummary = (
  body: unknown,
  replies: JSONRPCMessage[],
  ending: 'replied' | 'hung_up',
): McpRequestSummary | undefined => {
  if (body === undefined) return undefined;
  if (!isJSONRPCRequest(body) && !isJSONRPCNotification(body)) return { kind: 'unreadable' };
  if (isJSONRPCRequest(body) && body.method === 'tools/call') return summariseToolCall(body, replies, ending);
  if (isJSONRPCRequest(body) && body.method === 'initialize') {
    const initialize = InitializeRequestParamsSchema.safeParse(body.params);
    if (initialize.success) return summariseInitialize(initialize.data);
  }
  return { kind: 'other', method: clientMethods.has(body.method) ? body.method : 'unknown' };
};

const summariseInitialize = ({ clientInfo, capabilities }: InitializeRequestParams): McpRequestSummary => ({
  kind: 'initialize',
  client: { name: clientInfo.name, version: clientInfo.version },
  capabilities: Object.keys(capabilities),
  extensions: Object.keys(capabilities.extensions ?? {}).filter((extension) => knownExtensions.has(extension)),
});

const summariseToolCall = (
  body: JSONRPCRequest,
  replies: JSONRPCMessage[],
  ending: 'replied' | 'hung_up',
): McpRequestSummary => {
  const tool = toolCall.safeParse(body.params).data?.name ?? 'unknown';
  const reply = replies.filter(isResponse).find((response) => response.id === body.id);
  if (!reply) return { kind: ending === 'hung_up' ? 'no_reply' : 'sdk_error', tool };
  if (isJSONRPCErrorResponse(reply)) return { kind: 'sdk_error', tool };
  const result = CallToolResultSchema.safeParse(reply.result);
  const counted = result.success ? countResults(result.data) : undefined;
  return tool !== 'unknown' && counted ? { kind: 'tool_result', tool, ...counted } : { kind: 'sdk_error', tool };
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
