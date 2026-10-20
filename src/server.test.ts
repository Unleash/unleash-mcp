import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';
import { createRecordedClient } from './unleash/testClient.ts';

const { unleash, close } = createRecordedClient(new URL('./server.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
// Not `mcp-flag`: test files run in parallel while recording, and release.test.ts deletes that one.
const flag = 'mcp-server-flag';

// Archiving and then deleting from the archive removes the flag for good, so the release creates it.
const deleteFlag = async (): Promise<void> => {
  await unleash.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  await unleash.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
};

before(deleteFlag);
after(close);

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

test('release tool reports the targets', async () => {
  const client = await connectClient();

  const result = await client.callTool({
    name: 'release',
    arguments: { project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }], createFlag: true },
  });

  assert.deepEqual(result.structuredContent, {
    result: { kind: 'released', flag: { status: 'new', name: flag }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] },
  });
  await client.close();
});
