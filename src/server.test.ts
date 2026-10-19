import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';

test('client completes the MCP handshake with the server', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await client.connect(clientTransport);

  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});
