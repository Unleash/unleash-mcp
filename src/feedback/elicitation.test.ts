import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import { createElicitationConsentPrompt } from './elicitation.js';

const CONSENT_LOCATION = '/home/distinctive-test-user/.config/unleash-mcp/consent.json';

type ElicitAnswer = 'accept' | 'decline' | 'cancel';

let cleanupHandlers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupHandlers.map((close) => close()));
  cleanupHandlers = [];
});

async function connect(options: { answer?: ElicitAnswer; elicitation?: boolean }) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: 'test-server', version: '0.0.0' }, { capabilities: {} });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { capabilities: options.elicitation ? { elicitation: {} } : {} },
  );

  const requests: unknown[] = [];
  if (options.elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      requests.push(request.params);
      switch (options.answer) {
        case 'accept':
          return { action: 'accept', content: {} };
        case 'decline':
          return { action: 'decline' };
        default:
          return { action: 'cancel' };
      }
    });
  }

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  cleanupHandlers.push(async () => {
    await client.close();
    await server.close();
  });

  const askUser = createElicitationConsentPrompt(server, CONSENT_LOCATION, logger);
  return { askUser, requests };
}

describe('createElicitationConsentPrompt', () => {
  it('asks nothing when the client lacks the elicitation capability', async () => {
    const { askUser, requests } = await connect({ elicitation: false });

    const result = await askUser();

    expect(result).toBeUndefined();
    expect(requests).toEqual([]);
  });

  it.each<{ answer: ElicitAnswer; expected: 'granted' | 'denied' | undefined }>([
    { answer: 'accept', expected: 'granted' },
    { answer: 'decline', expected: 'denied' },
    { answer: 'cancel', expected: undefined },
  ])('maps a $answer answer to $expected', async ({ answer, expected }) => {
    const { askUser } = await connect({ elicitation: true, answer });

    const result = await askUser();

    expect(result).toBe(expected);
  });

  it('sends a form request describing the consent file location', async () => {
    const { askUser, requests } = await connect({ elicitation: true, answer: 'accept' });

    await askUser();

    expect(requests).toMatchObject([
      { mode: 'form', requestedSchema: { type: 'object', properties: {} } },
    ]);
    const [request] = requests as Array<{ message: string }>;
    expect(request.message).toContain(CONSENT_LOCATION);
  });
});
