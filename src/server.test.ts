import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';
import { createStubbedClient } from './unleash/testClient.ts';
import type { UnleashClient } from './unleash/client.ts';

const connectClient = async (unleash: UnleashClient): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(unleash).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
};

test('client completes the MCP handshake with the server', async () => {
  const client = await connectClient(createStubbedClient().unleash);

  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});

test('release tool reports the targets', async () => {
  const { unleash, stub } = createStubbedClient();
  const feature = '/api/admin/projects/shop/features/checkout-v2';
  stub.intercept({ path: '/api/admin/environments/project/shop', method: 'GET' }).reply(200, { version: 1, environments: [{ name: 'production', enabled: true }] });
  stub.intercept({ path: feature, method: 'GET' }).reply(200, { name: 'checkout-v2' });
  stub.intercept({ path: `${feature}/environments/production/strategies`, method: 'POST' }).reply(200, {});
  stub.intercept({ path: `${feature}/environments/production/on`, method: 'POST' }).reply(200, {});
  const client = await connectClient(unleash);

  const result = await client.callTool({
    name: 'release',
    arguments: { project: 'shop', flag: 'checkout-v2', environment: 'production', targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(result.structuredContent, {
    result: { kind: 'released', flag: { status: 'existing', name: 'checkout-v2' }, environment: 'production', targets: [{ name: 'Everyone', rollout: 50 }] },
  });
  await client.close();
});
