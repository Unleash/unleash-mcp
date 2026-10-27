import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ElicitResult, ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createAskUser } from './consentPrompt.ts';

// Connects a client that answers every question with `answer`, or one that can't be asked when there is none.
const connect = async (t: { after: (fn: () => Promise<void>) => void }, answer?: ElicitResult['action']) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: answer ? { elicitation: {} } : {} });
  const questions: string[] = [];
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async ({ params }) => {
      questions.push(params.message);
      return { action: answer, ...(answer === 'accept' ? { content: {} } : {}) };
    });
  }
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return { ask: createAskUser(server.server), questions };
};

test('shows the user the question and grants when they accept', async (t) => {
  const { ask, questions } = await connect(t, 'accept');

  const answer = await ask('Send reports?');

  assert.equal(answer, 'granted');
  assert.deepEqual(questions, ['Send reports?']);
});

test('denies when the user declines', async (t) => {
  const { ask } = await connect(t, 'decline');

  assert.equal(await ask('Send reports?'), 'denied');
});

test('has no answer when the user dismisses the question', async (t) => {
  const { ask } = await connect(t, 'cancel');

  assert.equal(await ask('Send reports?'), undefined);
});

test('has no answer when the client cannot show the question', async (t) => {
  const { ask } = await connect(t);

  assert.equal(await ask('Send reports?'), undefined);
});
