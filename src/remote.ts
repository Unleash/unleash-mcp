import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type CreateServerOptions, createUnleashMcpServer } from './server.js';

export type RemoteHandlerOptions = Omit<CreateServerOptions, 'authHeaders'>;

export type McpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  options: { authHeaders: Record<string, string>; parsedBody?: unknown },
) => Promise<void>;

/**
 * Create a stateless HTTP request handler for embedding the Unleash MCP server
 * inside an existing HTTP server (e.g. Express).
 *
 * Each request creates a fresh McpServer + StreamableHTTPServerTransport pair.
 * The caller provides auth headers per request (e.g. forwarded session cookies).
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
export function createMcpHandler(defaults: RemoteHandlerOptions): McpRequestHandler {
  return async (req, res, options) => {
    const server = createUnleashMcpServer({
      ...defaults,
      authHeaders: options.authHeaders,
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, options.parsedBody);
  };
}
