import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpHandler } from './remote.js';
import { createUnleashMcpServer } from './server.js';

vi.mock('./server.js', () => ({
  createUnleashMcpServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const createServerMock = vi.mocked(createUnleashMcpServer);

function fakeRequest() {
  const req = {} as IncomingMessage;
  const res = { on: vi.fn() } as unknown as ServerResponse;
  return { req, res };
}

describe('createMcpHandler feedbackConsent', () => {
  beforeEach(() => {
    createServerMock.mockClear();
  });

  it('defaults feedbackConsent to denied when handler options omit it', async () => {
    const handler = createMcpHandler({ baseUrl: 'http://localhost:4242' });
    const { req, res } = fakeRequest();

    await handler(req, res, { authHeaders: {} });

    expect(createServerMock).toHaveBeenCalledTimes(1);
    expect(createServerMock.mock.calls[0][0].feedbackConsent).toBe('denied');
  });

  it('defaults feedbackConsent to denied when handler options set it to undefined', async () => {
    const handler = createMcpHandler({
      baseUrl: 'http://localhost:4242',
      feedbackConsent: undefined,
    });
    const { req, res } = fakeRequest();

    await handler(req, res, { authHeaders: {} });

    expect(createServerMock.mock.calls[0][0].feedbackConsent).toBe('denied');
  });

  it.each([
    'granted',
    'denied',
  ] as const)('forwards handler-level feedbackConsent %s unchanged', async (feedbackConsent) => {
    const handler = createMcpHandler({ baseUrl: 'http://localhost:4242', feedbackConsent });
    const { req, res } = fakeRequest();

    await handler(req, res, { authHeaders: {} });

    expect(createServerMock.mock.calls[0][0].feedbackConsent).toBe(feedbackConsent);
  });
});
