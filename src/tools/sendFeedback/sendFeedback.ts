import type { components } from '../../unleash/api.d.ts';
import type { SendFeedbackInput } from './sendFeedbackInput.ts';
import type { SendFeedbackResult } from './sendFeedbackOutput.ts';
import { toFailed, type FailedCall } from '../shared/failed.ts';

type ProvideFeedback = components['schemas']['provideFeedbackSchema'];

// Unleash's own hosted instance, not the user's: the user's Unleash client and PAT never reach it.
const feedbackUrl = 'https://eu.app.unleash-hosted.com/hosted/feedback';

/** The `send_feedback` tool: posts one anonymous report to Unleash. Only create it once the user has opted in. */
export type SendFeedback = (input: SendFeedbackInput) => Promise<SendFeedbackResult>;

/** Creates `send_feedback`, posting with the given `fetch` and tagging each report with the server's `mcpVersion`. */
export const createSendFeedback =
  (fetch: typeof globalThis.fetch, mcpVersion: string): SendFeedback =>
    async ({ issueType, summary }) => {
      const body: ProvideFeedback = { category: 'mcp', areasForImprovement: JSON.stringify({ issueType, summary, mcpVersion }) };
      const response = await fetch(feedbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) return toFailed({ response, error: (await response.json().catch(() => undefined)) as FailedCall['error'] });
      return { kind: 'sent' };
    };
