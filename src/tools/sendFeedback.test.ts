import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger, ServerContext } from '../context.js';
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
  overrides: { clientInfo?: ClientInfo; attributionEnabled?: boolean; dryRun?: boolean } = {},
): ServerContext {
  const logger: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return {
    config: {
      unleash: {
        baseUrl: 'https://unleash.example.com',
        pat: '',
        feedbackUrl: 'https://feedback.example.com/hosted',
      },
      server: {
        dryRun: overrides.dryRun ?? false,
        logLevel: 'info',
        attributionEnabled: overrides.attributionEnabled ?? true,
      },
    },
    unleashClient: {} as UnleashClient,
    feedbackClient: { send: sendFeedbackRequest } as unknown as ServerContext['feedbackClient'],
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => overrides.clientInfo,
    notifyProgress: async () => {},
  };
}

function reportOf(result: Awaited<ReturnType<typeof sendFeedback>>): FeedbackReport {
  const { areasForImprovement } = result.structuredContent as { areasForImprovement: string };
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
    const areasForImprovement = JSON.stringify(expectedReport);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      success: true,
      dryRun: false,
      areasForImprovement,
    });
    expect(sendFeedbackRequest).toHaveBeenCalledTimes(1);
    expect(sendFeedbackRequest).toHaveBeenCalledWith(areasForImprovement);
    expect(result.content).toMatchObject([
      { type: 'text', text: expect.stringContaining('Feedback sent to Unleash.') },
    ]);
  });

  it('skips transmission and reports a dry run when dry-run mode is on', async () => {
    const context = createContext({ clientInfo: defaultClientInfo, dryRun: true });

    const result = await sendFeedback(context, defaultInput);

    expect(result.isError).toBeFalsy();
    expect(sendFeedbackRequest).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ success: true, dryRun: true });
    expect(result.content).toMatchObject([
      { type: 'text', text: expect.stringContaining('Executed in dry run. Feedback not sent.') },
    ]);
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

    const result = await sendFeedback(context, {
      issueType: 'unsupported_action',
      summary: 'User asked to order pizza, which is unrelated to feature flag management.',
    });

    expect(reportOf(result)).toMatchObject({
      issueType: 'unsupported_action',
      tool: null,
      errorCode: null,
    });
  });

  it('omits client fields when the client did not identify itself', async () => {
    const context = createContext();

    const result = await sendFeedback(context, {
      issueType: 'unexpected_result',
      tool: 'detect_flag',
      summary: 'Detection returned no candidates for an obviously flagged file.',
    });

    expect(reportOf(result)).not.toHaveProperty('client');
    expect(reportOf(result)).not.toHaveProperty('clientVersion');
  });

  it('omits client fields when client attribution is disabled', async () => {
    const context = createContext({ clientInfo: defaultClientInfo, attributionEnabled: false });

    const result = await sendFeedback(context, {
      issueType: 'unsupported_action',
      summary: 'Asked to deploy the application.',
    });

    expect(reportOf(result)).not.toHaveProperty('client');
  });
});
