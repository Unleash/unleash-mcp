import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';
import { createUnleashClient } from './unleash/client.ts';

const unleash = createUnleashClient({
  baseUrl: 'https://unleash.example',
  headers: {},
  fetch: async () => Response.json({}),
});

const connectClient = async (): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(unleash).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
};

test('client completes the MCP handshake with the server', async () => {
  const client = await connectClient();

  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});

test('release tool reports the rollout', async () => {
  const client = await connectClient();

  const result = await client.callTool({
    name: 'release',
    arguments: { project: 'shop', flag: 'checkout-v2', environment: 'production', rollout: 50 },
  });

  assert.deepEqual(result.structuredContent, {
    kind: 'released',
    flag: 'checkout-v2',
    environment: 'production',
    rollout: 50,
  });
  await client.close();
});
