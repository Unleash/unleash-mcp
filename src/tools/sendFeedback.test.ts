import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Logger, ServerContext } from '../context.js';
import type { ClientInfo } from '../unleash/attribution.js';
import type { UnleashClient } from '../unleash/client.js';
import { VERSION } from '../version.js';
import { type FeedbackReport, sendFeedback } from './sendFeedback.js';

const defaultClientInfo: ClientInfo = { name: 'claude-code', version: '1.2.3' };

function createContext(
  overrides: { clientInfo?: ClientInfo; attributionEnabled?: boolean } = {},
): ServerContext {
  const logger: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return {
    config: {
      unleash: { baseUrl: 'https://unleash.example.com', pat: '' },
      server: {
        dryRun: false,
        logLevel: 'info',
        attributionEnabled: overrides.attributionEnabled ?? true,
      },
    },
    unleashClient: {} as UnleashClient,
    logger,
    cache: { projects: null, featureFlags: new Map() },
    getClientInfo: () => overrides.clientInfo,
    notifyProgress: async () => {},
  };
}

function reportOf(result: Awaited<ReturnType<typeof sendFeedback>>): FeedbackReport {
  const feedback = (result.structuredContent as { feedback: { areasForImprovement: string } })
    .feedback;
  return JSON.parse(feedback.areasForImprovement) as FeedbackReport;
}

describe('send_feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records the report in the hosted feedback endpoint format without transmitting it', async () => {
    const context = createContext({ clientInfo: defaultClientInfo });

    const result = await sendFeedback(context, {
      issueType: 'tool_error',
      tool: 'create_flag',
      errorCode: 'HTTP_500',
      summary: 'The Unleash server returned an internal error while creating a flag.',
    });

    const expectedReport: FeedbackReport = {
      issueType: 'tool_error',
      summary: 'The Unleash server returned an internal error while creating a flag.',
      tool: 'create_flag',
      errorCode: 'HTTP_500',
      mcpVersion: VERSION,
      client: 'claude-code',
      clientVersion: '1.2.3',
    };
    const expectedPayload = {
      category: 'mcp',
      userType: null,
      areasForImprovement: JSON.stringify(expectedReport),
    };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      success: true,
      transmitted: false,
      feedback: expectedPayload,
    });
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
