import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { FeedbackConsentDecision } from '../feedback/consentDecision.js';
import { FeedbackConsentResolver } from '../feedback/consentResolver.js';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type { ClientInfo } from '../unleash/attribution.js';
import type { UnleashClient } from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { VERSION } from '../version.js';
import { type FeedbackReport, type SendFeedbackInput, sendFeedback } from './sendFeedback.js';

const defaultClientInfo: ClientInfo = { name: 'claude-code', version: '1.2.3' };

const defaultInput: SendFeedbackInput = {
  issueType: 'tool_error',
  tool: 'create_flag',
  errorCode: 'HTTP_500',
  summary: 'The Unleash server returned an internal error while creating a flag.',
};

const sendFeedbackRequest = vi.fn<(areasForImprovement: string) => Promise<void>>();

function createContext(
  overrides: {
    clientInfo?: ClientInfo;
    attributionEnabled?: boolean;
    dryRun?: boolean;
    consent?: FeedbackConsentDecision | 'undecided';
  } = {},
): ServerContext {
  const consent = overrides.consent ?? 'granted';
  const dryRun = overrides.dryRun ?? false;
  const feedbackConsentResolver = new FeedbackConsentResolver({
    initialConsent: consent === 'undecided' ? undefined : consent,
    logger,
  });
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: '',
        feedbackUrl: 'https://feedback.example.com/hosted',
      },
      server: {
        dryRun,
        logLevel: 'info',
        attributionEnabled: overrides.attributionEnabled ?? true,
      },
    },
    unleashClient: {} as UnleashClient,
    feedbackClient: { send: sendFeedbackRequest } as unknown as ServerContext['feedbackClient'],
    feedbackConsentResolver,
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => overrides.clientInfo,
    notifyProgress: async () => {},
  };
}

function sentReport(): FeedbackReport {
  const [areasForImprovement] = sendFeedbackRequest.mock.calls[0] ?? [];
  if (!areasForImprovement) throw new Error('No feedback was sent');
  return JSON.parse(areasForImprovement) as FeedbackReport;
}

describe('send_feedback', () => {
  afterEach(() => {
    sendFeedbackRequest.mockReset();
  });

  it('sends feedback using feedback client', async () => {
    sendFeedbackRequest.mockResolvedValue(undefined);
    const context = createContext({ clientInfo: defaultClientInfo });

    const result = await sendFeedback(context, defaultInput);

    const expectedReport: FeedbackReport = {
      issueType: 'tool_error',
      summary: 'The Unleash server returned an internal error while creating a flag.',
      tool: 'create_flag',
      errorCode: 'HTTP_500',
      mcpVersion: VERSION,
      client: 'claude-code',
      clientVersion: '1.2.3',
    };
    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).toHaveBeenCalledTimes(1);
    expect(sendFeedbackRequest).toHaveBeenCalledWith(JSON.stringify(expectedReport));
    expect(result.structuredContent).toEqual({ success: true, sent: true, dryRun: false });
  });

  it('skips transmission and reports a dry run when dry-run mode is on', async () => {
    const context = createContext({ clientInfo: defaultClientInfo, dryRun: true });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ success: true, sent: false, dryRun: true });
  });

  it('returns error on http client failure', async () => {
    sendFeedbackRequest.mockRejectedValue(
      new CustomError(
        'NETWORK_ERROR',
        'Failed to connect to the Unleash feedback endpoint',
        'Check that the configured feedback URL is reachable.',
      ),
    );
    const context = createContext();

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Failed to connect to the Unleash feedback endpoint',
        hint: 'Check that the configured feedback URL is reachable.',
      },
    });
    expect(result.content).toMatchObject([
      {
        type: 'text',
        text: expect.stringContaining('Error: Failed to connect to the Unleash feedback endpoint'),
      },
    ]);
  });

  it('reports an unsupported request with null tool and error code', async () => {
    const context = createContext({ clientInfo: defaultClientInfo });

    await sendFeedback(context, {
      issueType: 'unsupported_action',
      summary: 'User asked to order pizza, which is unrelated to feature flag management.',
    });

    expect(sentReport()).toMatchObject({
      issueType: 'unsupported_action',
      tool: null,
      errorCode: null,
    });
  });

  it('omits client fields when the client did not identify itself', async () => {
    const context = createContext();

    await sendFeedback(context, {
      issueType: 'unexpected_result',
      tool: 'detect_flag',
      summary: 'Detection returned no candidates for an obviously flagged file.',
    });

    expect(sentReport()).not.toHaveProperty('client');
    expect(sentReport()).not.toHaveProperty('clientVersion');
  });

  it('does not send when the user denied consent', async () => {
    const context = createContext({ consent: 'denied' });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ success: true, sent: false, dryRun: false });
  });

  it('does not send when consent has not been decided', async () => {
    const context = createContext({ consent: 'undecided' });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ success: true, sent: false, dryRun: false });
  });

  it('does not validate input when consent is denied', async () => {
    const context = createContext({ consent: 'denied' });

    const result = await sendFeedback(context, { ...defaultInput, tool: 'Create-Flag' });

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
  });

  it('omits client fields when client attribution is disabled', async () => {
    const context = createContext({ clientInfo: defaultClientInfo, attributionEnabled: false });

    await sendFeedback(context, {
      issueType: 'unsupported_action',
      summary: 'Asked to deploy the application.',
    });

    expect(sentReport()).not.toHaveProperty('client');
  });
});
