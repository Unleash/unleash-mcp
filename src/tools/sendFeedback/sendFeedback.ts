import type { components } from '../../unleash/api.d.ts';
import { type Failed, type FailedCall, toFailed } from '../shared/failed.ts';
import type { SendFeedbackInput } from './sendFeedbackInput.ts';
import type { SendFeedbackResult } from './sendFeedbackOutput.ts';

type ProvideFeedback = components['schemas']['provideFeedbackSchema'];

// Unleash's own hosted instance, not the user's: the user's Unleash client and PAT never reach it.
const feedbackUrl = 'https://eu.app.unleash-hosted.com/hosted/feedback';

/** The MCP client the agent runs in, as it named itself when it connected. */
export type ClientInfo = { name: string; version: string };

/** The `send_feedback` tool: posts one anonymous report to Unleash, naming the client when it is known. Only create it once the user has opted in. */
export type SendFeedback = (input: SendFeedbackInput, client?: ClientInfo) => Promise<SendFeedbackResult>;

/** Creates `send_feedback`, posting with the given `fetch` and tagging each report with the server's `mcpVersion`. */
export const createSendFeedback =
  (fetch: typeof globalThis.fetch, mcpVersion: string): SendFeedback =>
    async ({ issueType, summary, tool, error }, client) => {
      const report = { issueType, summary, ...(tool ? { tool } : {}), ...(error ? { error } : {}), mcpVersion, ...toClient(client) };
      const body: ProvideFeedback = { category: 'mcp', areasForImprovement: JSON.stringify(report) };
      const response = await fetch(feedbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }).catch(toUnreachable);
      if (!(response instanceof Response)) return response;
      if (!response.ok) return toFailed({ response, error: (await response.json().catch(() => undefined)) as FailedCall['error'] });
      return { kind: 'sent' };
    };

// A hanging connection would block the agent, so it fails the same way as no connection.
const timeoutMs = 10_000;

// fetch rejects only when no reply came: no connection (a TypeError whose cause says why) or the timeout fired.
// No reply means no HTTP status, hence 0.
const toUnreachable = (error: Error): Failed => {
  const cause = error.cause instanceof Error ? [error.cause.message] : [];
  return { kind: 'failed', status: 0, name: 'NetworkError', reasons: [error.message, ...cause] };
};

// The client picks its own name and version, so each is cut to a short, plain value.
const clean = (value: string): string => value.replace(/[\p{Cc}();]/gu, '').trim().slice(0, 64);

// A name without a version, or the reverse, tells too little, so both are left out.
const toClient = (client: ClientInfo | undefined): { client: string; clientVersion: string } | Record<string, never> => {
  const name = clean(client?.name ?? '');
  const version = clean(client?.version ?? '');
  return name && version ? { client: name, clientVersion: version } : {};
};
