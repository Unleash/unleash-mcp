import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';

const connectClient = async (): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
};

test('client completes the MCP handshake with the server', async () => {
  const client = await connectClient();

  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});

test('ping tool replies with pong', async () => {
  const client = await connectClient();

  const result = await client.callTool({ name: 'ping', arguments: {} });

  assert.deepEqual(result.content, [{ type: 'text', text: 'pong' }]);
  await client.close();
});
