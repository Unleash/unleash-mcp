import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '../context.js';
import type { FeedbackConsentDecision } from '../feedback/consentDecision.js';
import { FeedbackConsentResolver } from '../feedback/consentResolver.js';
import type { ConsentStore } from '../feedback/consentStore.js';
import type { AskUser } from '../feedback/elicitation.js';
import {
  createFakeConsentStore,
  FAKE_CONSENT_WRITE_ERROR,
} from '../test-utils/fakeConsentStore.js';
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
    askUser?: AskUser;
    store?: ConsentStore;
  } = {},
): ServerContext {
  const consent = overrides.consent ?? 'granted';
  const dryRun = overrides.dryRun ?? false;
  const feedbackConsentResolver = new FeedbackConsentResolver({
    initialConsent: consent === 'undecided' ? undefined : consent,
    askUser: overrides.askUser ?? (async () => undefined),
    clientShowsConsentPrompt: () => true,
    store: overrides.store ?? createFakeConsentStore().store,
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
    expect(result.structuredContent).toEqual({
      success: true,
      sent: true,
      dryRun: false,
      message: 'Feedback sent to Unleash.',
    });
  });

  it('skips transmission and reports a dry run when dry-run mode is on', async () => {
    const context = createContext({ clientInfo: defaultClientInfo, dryRun: true });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      success: true,
      sent: false,
      dryRun: true,
      message: '[DRY_RUN] Would send Feedback to Unleash.',
    });
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
    expect(result.structuredContent).toEqual({
      success: true,
      sent: false,
      dryRun: false,
      message:
        'Feedback is disabled: the user has not opted in to sending feedback to Unleash. Do not call send_feedback again in this session.',
    });
  });

  it('sends when the user grants consent at the prompt', async () => {
    sendFeedbackRequest.mockResolvedValue(undefined);
    const context = createContext({
      consent: 'undecided',
      askUser: async () => 'granted',
    });

    const result = await sendFeedback(context, defaultInput);

    expect(sendFeedbackRequest).toHaveBeenCalledTimes(1);
    expect(result.structuredContent).toEqual({
      success: true,
      sent: true,
      dryRun: false,
      message: 'Feedback sent to Unleash.',
    });
  });

  it('does not send when the consent prompt is unanswered', async () => {
    const context = createContext({ consent: 'undecided' });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      success: true,
      sent: false,
      dryRun: false,
      message:
        'Feedback is disabled: the user has not opted in to sending feedback to Unleash. Do not call send_feedback again in this session.',
    });
  });

  it('asks for consent in dry-run mode but never sends', async () => {
    const askUser = vi.fn<AskUser>(async () => 'granted');
    const context = createContext({ dryRun: true, consent: 'undecided', askUser });

    const result = await sendFeedback(context, defaultInput);

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      success: true,
      sent: false,
      dryRun: true,
      message: '[DRY_RUN] Would send Feedback to Unleash.',
    });
  });

  it.each([
    { answer: 'granted', sent: true },
    { answer: 'denied', sent: false },
  ] as const)('reports the store error in the result when the $answer decision cannot be saved', async ({
    answer,
    sent,
  }) => {
    sendFeedbackRequest.mockResolvedValue(undefined);
    const context = createContext({
      consent: 'undecided',
      askUser: async () => answer,
      store: createFakeConsentStore({ writable: false }).store,
    });

    const result = await sendFeedback(context, defaultInput);

    expect(sendFeedbackRequest).toHaveBeenCalledTimes(sent ? 1 : 0);
    expect(result.isError).toBeFalsy();
    expect(result).toMatchObject({
      content: [
        { type: 'text' },
        { type: 'text', text: expect.stringContaining(FAKE_CONSENT_WRITE_ERROR) },
      ],
      structuredContent: {
        success: true,
        sent,
        warning: expect.stringContaining(FAKE_CONSENT_WRITE_ERROR),
      },
    });
  });

  it('keeps the store warning on the error result when the send fails', async () => {
    sendFeedbackRequest.mockRejectedValue(
      new CustomError('NETWORK_ERROR', 'Failed to connect to the Unleash feedback endpoint'),
    );
    const context = createContext({
      consent: 'undecided',
      askUser: async () => 'granted',
      store: createFakeConsentStore({ writable: false }).store,
    });

    const result = await sendFeedback(context, defaultInput);

    expect(result).toMatchObject({
      isError: true,
      content: [
        { type: 'text' },
        { type: 'text', text: expect.stringContaining(FAKE_CONSENT_WRITE_ERROR) },
      ],
      structuredContent: {
        success: false,
        error: { code: 'NETWORK_ERROR' },
        warning: expect.stringContaining(FAKE_CONSENT_WRITE_ERROR),
      },
    });
  });

  it('rejects invalid input once consent is granted', async () => {
    const askUser = vi.fn<AskUser>(async () => 'granted');
    const context = createContext({ consent: 'undecided', askUser });

    const result = await sendFeedback(context, { ...defaultInput, tool: 'Create-Flag' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
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
