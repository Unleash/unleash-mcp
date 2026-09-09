import { describe, expect, it, vi } from 'vitest';
import type { Logger, ServerContext } from '../context.js';
import type { UnleashClient } from '../unleash/client.js';
import { VERSION } from '../version.js';
import { sendFeedback } from './sendFeedback.js';

function createContext(overrides: Partial<ServerContext> = {}): ServerContext & { logger: Logger } {
  const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    config: {
      unleash: { baseUrl: 'https://unleash.example.com', pat: '' },
      server: { dryRun: false, logLevel: 'info', attributionEnabled: true },
    },
    unleashClient: {} as UnleashClient,
    logger,
    cache: { projects: null, featureFlags: new Map() },
    notifyProgress: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('send_feedback', () => {
  it('logs an allowlisted payload and does not call fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const context = createContext({
      getClientInfo: () => ({ name: 'claude-code', version: '1.2.3' }),
    });

    const result = await sendFeedback(context, {
      issueType: 'tool_error',
      tool: 'create_flag',
      errorCode: 'HTTP_403',
      summary: 'Token lacked permission to create flags.',
    });

    expect(result.isError).toBeFalsy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    const expectedPayload = {
      category: 'mcp',
      userType: 'claude-code/1.2.3',
      areasForImprovement: {
        issueType: 'tool_error',
        tool: 'create_flag',
        errorCode: 'HTTP_403',
        mcpVersion: VERSION,
        summary: 'Token lacked permission to create flags.',
      },
    };
    expect(result.structuredContent).toEqual({
      success: true,
      transmitted: false,
      feedback: expectedPayload,
    });
    expect(context.logger.info).toHaveBeenCalledTimes(1);
    expect(context.logger.info).toHaveBeenCalledWith(
      `[send_feedback] ${JSON.stringify(expectedPayload)}`,
    );
  });

  it('logs on every call, including repeated identical feedback', async () => {
    const context = createContext();
    const args = { issueType: 'unsupported_action', summary: 'Asked to delete a project.' };

    await sendFeedback(context, args);
    await sendFeedback(context, args);

    expect(context.logger.info).toHaveBeenCalledTimes(2);
  });

  it('falls back to unknown userType when client info is unavailable', async () => {
    const context = createContext();

    const result = await sendFeedback(context, {
      issueType: 'unexpected_result',
      tool: 'detect_flag',
      summary: 'Detection returned no candidates for an obviously flagged file.',
    });

    expect(result.structuredContent).toMatchObject({
      feedback: { userType: 'unknown', areasForImprovement: { tool: 'detect_flag' } },
    });
  });

  it('returns a validation error for invalid input', async () => {
    const context = createContext();

    const result = await sendFeedback(context, { issueType: 'bogus', summary: '' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(context.logger.info).not.toHaveBeenCalled();
  });
});

describe('handleToolError feedback nudge', () => {
  it('tells the assistant to call send_feedback after a tool error', async () => {
    const { handleToolError } = await import('../context.js');
    const context = createContext();

    const result = handleToolError(context, new Error('boom'), 'create_flag');

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(
        'call send_feedback with issueType "tool_error", tool "create_flag", and errorCode "UNKNOWN_ERROR"',
      ),
    });
  });

  it('does not nudge when send_feedback itself fails', async () => {
    const context = createContext();

    const result = await sendFeedback(context, { issueType: 'bogus', summary: '' });

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.not.stringContaining('call send_feedback'),
    });
  });
});
