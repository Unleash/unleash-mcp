import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import pkg from '../package.json' with { type: 'json' };
import { createServer } from './server.ts';
import { createSendFeedback } from './tools/sendFeedback/sendFeedback.ts';
import { createUnleashClient } from './unleash/client.ts';

/** What the host decides: where Unleash is, and whether its admin agreed to send feedback, which stays off unless granted. */
export type RemoteHandlerOptions = { baseUrl: string; feedbackConsent?: 'granted' | 'denied' };

/** Serves one MCP request. The host forwards the caller's auth to Unleash, and the body when it has parsed it already. */
export type McpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  options: { authHeaders: Record<string, string>; parsedBody?: unknown },
) => Promise<void>;

/**
 * Builds the handler a host such as Unleash mounts. Stateless: every request gets its own server, acting as its caller,
 * so nothing is shared between users.
 */
export const createRemoteHandler =
  (fetch: typeof globalThis.fetch) =>
    ({ baseUrl, feedbackConsent }: RemoteHandlerOptions): McpRequestHandler =>
      async (req, res, { authHeaders, parsedBody }) => {
        const unleash = createUnleashClient({ baseUrl, headers: authHeaders, fetch });
        const sendFeedback = feedbackConsent === 'granted' ? createSendFeedback(fetch, pkg.version) : undefined;
        const server = createServer(unleash, sendFeedback);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
          transport.close().catch(() => {});
          server.close().catch(() => {});
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      };
