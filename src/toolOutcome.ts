import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readFailedToolResult } from './server.ts';
import { failed } from './tools/shared/failed.ts';

type ToolError = { errorName: string; errorStatus: number };

/**
 * How a tool call ended. `queries` is set for a tool that takes a list of queries, with the error of each one that failed.
 * `refused` means the SDK replied instead of the tool, for an unknown tool, invalid arguments or a tool that threw.
 * `resultBytes` is the size of the text blocks the agent reads.
 */
export type ToolOutcome =
  | { kind: 'succeeded'; resultBytes: number; queries?: { total: number; failed: ToolError[] } }
  | ({ kind: 'failed'; resultBytes: number } & ToolError)
  | { kind: 'refused'; resultBytes: number };

/** Calls `onToolOutcome` once the transport has sent the reply to a tool call. Any other request is left alone. */
export const reportToolOutcome = (
  transport: Transport,
  body: unknown,
  onToolOutcome: (outcome: ToolOutcome) => void,
): void => {
  if (!isJSONRPCRequest(body) || body.method !== 'tools/call') return;
  const send = transport.send.bind(transport);
  transport.send = async (message, options) => {
    await send(message, options);
    if (isJSONRPCResultResponse(message) && message.id === body.id) {
      onToolOutcome(toToolOutcome(message.result));
    }
    // The SDK replies with a JSON-RPC error when the call's params are malformed, such as a missing tool name.
    if (isJSONRPCErrorResponse(message) && message.id === body.id) {
      onToolOutcome({ kind: 'refused', resultBytes: Buffer.byteLength(message.error.message) });
    }
  };
};

// Tools that take a list of queries return one result per query.
const queryResults = z.object({ results: z.array(z.unknown()) });
// configure and manage_flag nest the failure under `error`, next to the change it answers.
const failedQuery = z.union([
  failed,
  z.object({ kind: z.literal('failed'), error: failed.omit({ kind: true }) }).transform(({ error }) => error),
]);

const toToolOutcome = (response: unknown): ToolOutcome => {
  const parsed = CallToolResultSchema.safeParse(response);
  if (!parsed.success) return { kind: 'refused', resultBytes: 0 };
  const result = parsed.data;
  const resultBytes = Buffer.byteLength(
    result.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
  );

  if (result.isError) {
    const failure = readFailedToolResult(result);
    if (failure) return { kind: 'failed', resultBytes, errorName: failure.name, errorStatus: failure.status };
    return { kind: 'refused', resultBytes };
  }

  const queries = queryResults.safeParse(result.structuredContent);
  if (queries.success) {
    const { results } = queries.data;
    const failedQueries = results.flatMap((r) => {
      const failure = failedQuery.safeParse(r);
      return failure.success ? [{ errorName: failure.data.name, errorStatus: failure.data.status }] : [];
    });
    return { kind: 'succeeded', resultBytes, queries: { total: results.length, failed: failedQueries } };
  }
  return { kind: 'succeeded', resultBytes };
};
