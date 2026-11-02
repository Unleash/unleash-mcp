import type { components } from '../../unleash/api.d.ts';
import { type FailedCall, timeoutMs, toFailed, toUnreachable } from '../shared/failed.ts';
import type { AskUser, Consent } from './consent.ts';
import type { SendFeedbackInput } from './sendFeedbackInput.ts';
import type { SendFeedbackResult } from './sendFeedbackOutput.ts';

type ProvideFeedback = components['schemas']['provideFeedbackSchema'];

/** The MCP client the agent runs in, as it named itself when it connected. */
export type ClientInfo = { name: string; version: string };

/** The client the agent runs in: its name and version when known, and how to ask its user. */
export type ConnectedClient = { info?: ClientInfo; ask: AskUser };

/** The `send_feedback` tool: posts one anonymous report to Unleash, naming the client when it is known, once the user consents. */
export type SendFeedback = (input: SendFeedbackInput, client: ConnectedClient) => Promise<SendFeedbackResult>;

/** The Unleash instance that receives reports unless the user or host picks another. */
export const defaultFeedbackBaseUrl = 'https://eu.app.unleash-hosted.com/hosted/';

/**
 * Creates `send_feedback`, posting with the given `fetch` to the Unleash instance at `feedbackBaseUrl` and tagging each report
 * with the server's `mcpVersion`. Each report waits for `consent`.
 */
export const createSendFeedback = ({
  fetch,
  mcpVersion,
  feedbackBaseUrl,
  consent,
}: {
  fetch: typeof globalThis.fetch;
  mcpVersion: string;
  feedbackBaseUrl: string;
  consent: Consent;
}): SendFeedback => {
  const feedbackUrl = `${feedbackBaseUrl.replace(/\/+$/, '')}/feedback`;
  return async ({ issueType, summary, tool, error }, { info, ask }) => {
    if ((await consent({ name: info?.name, ask })) === 'denied') return { kind: 'disabled' };
    const report = {
      issueType,
      summary,
      ...(tool ? { tool } : {}),
      ...(error ? { error } : {}),
      mcpVersion,
      ...toClient(info),
    };
    const body: ProvideFeedback = { category: 'mcp', areasForImprovement: JSON.stringify(report) };
    const response = await fetch(feedbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(toUnreachable);
    if (!(response instanceof Response)) return response;
    if (!response.ok)
      return toFailed({ response, error: (await response.json().catch(() => undefined)) as FailedCall['error'] });
    return { kind: 'sent' };
  };
};

// The client picks its own name and version, so each is cut to a short, plain value.
const clean = (value: string): string =>
  value
    .replace(/[\p{Cc}();]/gu, '')
    .trim()
    .slice(0, 64);

// A name without a version, or the reverse, tells too little, so both are left out.
const toClient = (
  client: ClientInfo | undefined,
): { client: string; clientVersion: string } | Record<string, never> => {
  const name = clean(client?.name ?? '');
  const version = clean(client?.version ?? '');
  return name && version ? { client: name, clientVersion: version } : {};
};
