import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCResultResponse,
  type RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type CreateServerOptions, createUnleashMcpServer } from './server.js';

export type ToolCall =
  | { tool: string; outcome: 'succeeded' }
  | { tool: string; outcome: 'failed'; errorCode: string };

export type RemoteHandlerOptions = Omit<CreateServerOptions, 'authHeaders'> & {
  /** Called with how a tools/call request ended, after its response is sent. */
  onToolCall?: (call: ToolCall) => void;
};

export type McpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    authHeaders: Record<string, string>;
    parsedBody?: unknown;
  },
) => Promise<void>;

/**
 * Create a stateless HTTP request handler for embedding the Unleash MCP server
 * inside an existing HTTP server (e.g. Express).
 *
 * Each request creates a fresh McpServer + StreamableHTTPServerTransport pair.
 * The caller provides auth headers per request (e.g. forwarded session cookies) and may
 * pass the user's send_feedback consent, which overrides the handler-level default.
 *
 * Usage with Express:
 * ```typescript
 * import { createMcpHandler } from '@unleash/mcp/remote';
 * const handleMcp = createMcpHandler({ baseUrl: 'http://localhost:4242' });
 * app.post('/api/mcp', async (req, res) => {
 *   await handleMcp(req, res, { authHeaders: extractAuth(req), parsedBody: req.body });
 * });
 * ```
 */
export function createMcpHandler({
  onToolCall,
  ...defaults
}: RemoteHandlerOptions): McpRequestHandler {
  return async (req, res, options) => {
    const server = createUnleashMcpServer({
      ...defaults,
      authHeaders: options.authHeaders,
      feedbackConsent: defaults.feedbackConsent ?? 'denied',
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    if (onToolCall) {
      reportToolCalls(transport, options.parsedBody, onToolCall);
    }

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, options.parsedBody);
  };
}

// Reads the responses instead of wrapping the tools, because the SDK answers unknown
// tools and arguments that fail the input schema itself, before any tool code runs.
function reportToolCalls(
  transport: Transport,
  body: unknown,
  onToolCall: (call: ToolCall) => void,
): void {
  const toolNames = new Map<RequestId, string>();
  for (const message of Array.isArray(body) ? body : [body]) {
    if (
      isJSONRPCRequest(message) &&
      message.method === 'tools/call' &&
      typeof message.params?.name === 'string'
    ) {
      toolNames.set(message.id, message.params.name);
    }
  }
  if (toolNames.size === 0) {
    return;
  }

  const send = transport.send.bind(transport);
  transport.send = async (message, sendOptions) => {
    await send(message, sendOptions);
    if (isJSONRPCResultResponse(message)) {
      const tool = toolNames.get(message.id);
      if (tool) {
        onToolCall(toToolCall(tool, message));
      }
    }
  };
}

const ToolErrorSchema = z.object({ error: z.object({ code: z.string() }) });

function toToolCall(tool: string, response: JSONRPCResultResponse): ToolCall {
  if (response.result.isError !== true) {
    return { tool, outcome: 'succeeded' };
  }

  // Every tool error carries a code, since the server turns a throw into handleToolError.
  // One without a code came from the SDK, which uses InvalidParams for unknown tools and bad arguments.
  const toolError = ToolErrorSchema.safeParse(response.result.structuredContent);
  return {
    tool,
    outcome: 'failed',
    errorCode: toolError.success ? toolError.data.error.code : 'INVALID_PARAMS',
  };
}
