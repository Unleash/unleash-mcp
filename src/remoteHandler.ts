import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import pkg from '../package.json' with { type: 'json' };
import { type McpRequestSummary, toMcpRequestSummary } from './mcpRequestSummary.ts';
import { createServer } from './server.ts';
import { granted } from './tools/sendFeedback/consent.ts';
import { createSendFeedback, defaultFeedbackBaseUrl } from './tools/sendFeedback/sendFeedback.ts';
import { createUnleashClient } from './unleash/client.ts';

/**
 * What the host decides: where Unleash is, whether its admin agreed to send feedback, and the Unleash instance that receives it
 * (unset, Unleash's own instance).
 */
export type RemoteHandlerOptions = { baseUrl: string; feedbackConsent: 'granted' | 'denied'; feedbackUrl?: string };

/** Serves one MCP request. The host forwards the caller's auth to Unleash, and the body when it has parsed it already. */
export type McpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  options: { authHeaders: Record<string, string>; parsedBody?: unknown },
) => Promise<McpRequestSummary | undefined>;

/**
 * Builds the handler a host such as Unleash mounts. Stateless: every request gets its own server, acting as its caller,
 * so nothing is shared between users.
 */
export const createRemoteHandler =
  (fetch: typeof globalThis.fetch) =>
  ({ baseUrl, feedbackConsent, feedbackUrl = defaultFeedbackBaseUrl }: RemoteHandlerOptions): McpRequestHandler =>
  async (req, res, { authHeaders, parsedBody }) => {
    const unleash = createUnleashClient({ baseUrl, headers: authHeaders, fetch });
    const sendFeedback =
      feedbackConsent === 'granted'
        ? createSendFeedback({ fetch, mcpVersion: pkg.version, feedbackBaseUrl: feedbackUrl, consent: granted })
        : undefined;
    const server = createServer(unleash, fetch, sendFeedback);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    // SDK 1.32 has no hook on replies.
    const replies: JSONRPCMessage[] = [];
    const send = transport.send.bind(transport);
    transport.send = async (message, options) => {
      replies.push(message);
      await send(message, options);
    };
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    // handleRequest never settles when the client hangs up before the reply, so a closed response ends the wait too.
    await Promise.race([
      transport.handleRequest(req, res, parsedBody),
      new Promise((resolve) => res.once('close', resolve)),
    ]);
    return toMcpRequestSummary(parsedBody, replies);
  };
