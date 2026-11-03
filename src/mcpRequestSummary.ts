import {
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isToolName, readFailedToolResult } from './server.ts';
import { failed } from './tools/shared/failed.ts';

type ToolError = { name: string; status: number };

/**
 * `refused` is the SDK replying instead of the tool: an unknown tool, invalid arguments or a tool that threw.
 * `resultBytes` counts only the text the agent reads, since a success carries its JSON twice.
 */
export type ToolOutcome =
  | { kind: 'succeeded'; resultBytes: number; results?: { total: number; failed: ToolError[] } }
  | { kind: 'failed'; resultBytes: number; error: ToolError }
  | { kind: 'refused'; resultBytes: number }
  | { kind: 'unreadable' };

// A name that is not one of this server's tools came from the client, so it never leaves the package.
export type McpRequestSummary =
  | { kind: 'tool_call'; tool: string; outcome: ToolOutcome }
  | { kind: 'unknown_tool_call'; outcome: ToolOutcome };

const toolName = CallToolRequestParamsSchema.pick({ name: true });

export const toMcpRequestSummary = (body: unknown, replies: JSONRPCMessage[]): McpRequestSummary | undefined => {
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') return undefined;
  const outcome = toOutcome(replies.find((reply) => 'id' in reply && reply.id === body.id));
  if (!outcome) return undefined;
  const name = toolName.safeParse(body.params).data?.name;
  return name && isToolName(name) ? { kind: 'tool_call', tool: name, outcome } : { kind: 'unknown_tool_call', outcome };
};

const toOutcome = (reply: JSONRPCMessage | undefined): ToolOutcome | undefined => {
  if (isJSONRPCResultResponse(reply)) return toToolOutcome(reply.result);
  // The SDK replies with a JSON-RPC error when the call's params are malformed, such as a missing tool name.
  if (isJSONRPCErrorResponse(reply)) return { kind: 'refused', resultBytes: Buffer.byteLength(reply.error.message) };
  return undefined;
};

const listResults = z.object({ results: z.array(z.unknown()) });
const failedResult = z.union([
  failed.pick({ kind: true, name: true, status: true }),
  z
    .object({ kind: z.literal('failed'), error: failed.pick({ name: true, status: true }) })
    .transform(({ error }) => error),
]);

const toToolOutcome = (response: unknown): ToolOutcome => {
  const parsed = CallToolResultSchema.safeParse(response);
  if (parsed.success) {
    const result = parsed.data;
    const resultBytes = Buffer.byteLength(
      result.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
    );

    if (result.isError) {
      const failure = readFailedToolResult(result);
      if (failure) return { kind: 'failed', resultBytes, error: { name: failure.name, status: failure.status } };
      return { kind: 'refused', resultBytes };
    }

    const list = listResults.safeParse(result.structuredContent);
    if (list.success) {
      const { results } = list.data;
      const failedResults = results.flatMap((r) => {
        const read = failedResult.safeParse(r);
        return read.success ? [{ name: read.data.name, status: read.data.status }] : [];
      });
      return { kind: 'succeeded', resultBytes, results: { total: results.length, failed: failedResults } };
    }
    return { kind: 'succeeded', resultBytes };
  }
  return { kind: 'unreadable' };
};
