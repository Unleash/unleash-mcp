import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isToolName, readFailedToolResult } from './server.ts';
import { failed, failedError } from './tools/shared/failed.ts';

type ToolError = { errorName: string; errorStatus: number };

/**
 * How a tool call ended. `results` is set for a tool that returns one result per query or change, with the error of each
 * one that failed. `refused` means the SDK replied instead of the tool, for an unknown tool, invalid arguments or a tool
 * that threw. `unreadable` is a reply that is not a tool result. `resultBytes` is the size of the text the agent reads.
 */
export type ToolOutcome =
  | { kind: 'succeeded'; resultBytes: number; results?: { total: number; failed: ToolError[] } }
  | ({ kind: 'failed'; resultBytes: number } & ToolError)
  | { kind: 'refused'; resultBytes: number }
  | { kind: 'unreadable' };

/**
 * What one request to the remote server was, for the host's analytics. `tool` is set only when the name is one of this
 * server's tools. `unreadable` is a body that is not a single JSON-RPC request or notification, such as a batch.
 */
export type McpRequestReport =
  | {
      kind: 'initialize';
      client?: { name: string; version: string };
      capabilities: string[];
      extensions: string[];
    }
  | { kind: 'tool_call'; tool?: string; outcome: ToolOutcome }
  | { kind: 'other'; method: string }
  | { kind: 'unreadable' };

const toolName = CallToolRequestParamsSchema.pick({ name: true });

/**
 * Calls `onRequest` once per request that has a body: after the reply is sent for a request, at once for a notification
 * or any other body.
 */
export const reportRequest = ({
  server,
  transport,
  body,
  onRequest,
}: {
  server: McpServer;
  transport: Transport;
  body: unknown;
  onRequest: (report: McpRequestReport) => void;
}): void => {
  if (body === undefined) return;
  if (isJSONRPCRequest(body)) {
    const send = transport.send.bind(transport);
    transport.send = async (message, options) => {
      await send(message, options);
      const answersRequest =
        (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id === body.id;
      if (!answersRequest) return;
      if (body.method === 'initialize') {
        const capabilities = server.server.getClientCapabilities() ?? {};
        onRequest({
          kind: 'initialize',
          client: server.server.getClientVersion(),
          capabilities: Object.keys(capabilities),
          extensions: Object.keys(capabilities.extensions ?? {}),
        });
        return;
      }
      if (body.method === 'tools/call') {
        const name = toolName.safeParse(body.params).data?.name;
        // The SDK replies with a JSON-RPC error when the call's params are malformed, such as a missing tool name.
        const outcome: ToolOutcome = isJSONRPCErrorResponse(message)
          ? { kind: 'refused', resultBytes: Buffer.byteLength(message.error.message) }
          : toToolOutcome(message.result);
        onRequest({ kind: 'tool_call', tool: name && isToolName(name) ? name : undefined, outcome });
        return;
      }
      onRequest({ kind: 'other', method: body.method });
    };
    return;
  }
  if (isJSONRPCNotification(body)) {
    onRequest({ kind: 'other', method: body.method });
    return;
  }
  onRequest({ kind: 'unreadable' });
};

// Tools that take a list of queries or changes return one result for each.
const listResults = z.object({ results: z.array(z.unknown()) });
// A failed query is a failure itself. A failed change nests the failure under `error`, next to the change it answers.
const failedResult = z.union([
  failed.pick({ kind: true, name: true, status: true }),
  z
    .object({ kind: z.literal('failed'), error: failedError.pick({ name: true, status: true }) })
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
      if (failure) return { kind: 'failed', resultBytes, errorName: failure.name, errorStatus: failure.status };
      return { kind: 'refused', resultBytes };
    }

    const list = listResults.safeParse(result.structuredContent);
    if (list.success) {
      const { results } = list.data;
      const failedResults = results.flatMap((r) => {
        const read = failedResult.safeParse(r);
        return read.success ? [{ errorName: read.data.name, errorStatus: read.data.status }] : [];
      });
      return { kind: 'succeeded', resultBytes, results: { total: results.length, failed: failedResults } };
    }
    return { kind: 'succeeded', resultBytes };
  }
  return { kind: 'unreadable' };
};
