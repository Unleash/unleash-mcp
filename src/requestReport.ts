import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isToolName, readFailedToolResult } from './server.ts';
import { failed } from './tools/shared/failed.ts';

type ToolError = { name: string; status: number };

/**
 * How a tool call ended. `results` is set for a tool that returns one result per query or change, with the error of each
 * one that failed. `refused` means the SDK replied instead of the tool, for an unknown tool, invalid arguments or a tool
 * that threw. `unreadable` is a reply that is not a tool result. `resultBytes` is the size of the text the agent reads.
 */
export type ToolOutcome =
  | { kind: 'succeeded'; resultBytes: number; results?: { total: number; failed: ToolError[] } }
  | { kind: 'failed'; resultBytes: number; error: ToolError }
  | { kind: 'refused'; resultBytes: number }
  | { kind: 'unreadable' };

/**
 * What one request to the remote server was, for the host's analytics. `unknown_tool_call` is a call naming no tool of
 * this server, so the name stays out.
 */
export type McpRequestReport =
  | { kind: 'tool_call'; tool: string; outcome: ToolOutcome }
  | { kind: 'unknown_tool_call'; outcome: ToolOutcome };

const toolName = CallToolRequestParamsSchema.pick({ name: true });

/** Calls `onRequest` once per tool call, after its reply is sent. */
export const reportRequest = ({
  transport,
  body,
  onRequest,
}: {
  transport: Transport;
  body: unknown;
  onRequest: (report: McpRequestReport) => void;
}): void => {
  // A host callback that throws must not reach the SDK, which may already have sent the reply.
  const report = (r: McpRequestReport): void => {
    try {
      Promise.resolve(onRequest(r)).catch(() => {});
    } catch {}
  };
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') return;
  const send = transport.send.bind(transport);
  transport.send = async (message, options) => {
    await send(message, options);
    const answersRequest =
      (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id === body.id;
    if (!answersRequest) return;
    const name = toolName.safeParse(body.params).data?.name;
    // The SDK replies with a JSON-RPC error when the call's params are malformed, such as a missing tool name.
    const outcome: ToolOutcome = isJSONRPCErrorResponse(message)
      ? { kind: 'refused', resultBytes: Buffer.byteLength(message.error.message) }
      : toToolOutcome(message.result);
    report(
      name && isToolName(name) ? { kind: 'tool_call', tool: name, outcome } : { kind: 'unknown_tool_call', outcome },
    );
  };
};

// Tools that take a list of queries or changes return one result for each.
const listResults = z.object({ results: z.array(z.unknown()) });
// A failed query is a failure itself. A failed change nests the failure under `error`, next to the change it answers.
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
