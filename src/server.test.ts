import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';
import type { UnleashClient } from './unleash/client.ts';
import { createRecordedClient, createStubbedClient } from './unleash/testClient.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./server.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
// Not `mcp-flag`: test files run in parallel while recording, and release.test.ts deletes that one.
const flag = 'mcp-server-flag';

// Archiving and then deleting from the archive removes the flag for good, so the release creates it.
const deleteFlag = async (): Promise<void> => {
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  await admin.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
};

before(deleteFlag);
after(close);

const connectClient = async (server: UnleashClient = unleash): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(server).connect(serverTransport);
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
    arguments: { project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  assert.deepEqual(result.structuredContent, {
    result: { kind: 'released', flag: { status: 'new', name: flag }, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] },
  });
  assert.deepEqual(result.content, []);
  await client.close();
});

test('release tool reports a failure as text', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  const message = 'You need the "SKIP_CHANGE_REQUEST" permission.';
  stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(200, { versionInfo: { current: { enterprise: '' } } });
  stub.intercept({ path: `/api/admin/projects/${project}/features/${flag}`, method: 'GET' }).reply(403, { name: 'PermissionError', message, details: [{ message }] });
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'release',
    arguments: { project, flag, environment: 'development', targets: [{ name: 'Everyone', rollout: 50 }] },
  });

  const failed = { result: { kind: 'failed', status: 403, name: 'PermissionError', reasons: [message] } };
  assert.deepEqual(result, { isError: true, content: [{ type: 'text', text: JSON.stringify(failed) }] });
  await client.close();
});

test('inspect tool returns its results as structured content', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub.intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' }).reply(200, { environments: [{ environment: 'development' }] });
  const client = await connectClient(stubbed);

  const result = await client.callTool({ name: 'inspect', arguments: { queries: [{ kind: 'project', project }] } });

  assert.deepEqual(result.structuredContent, { results: [{ kind: 'project', environments: ['development'] }] });
  assert.deepEqual(result.content, []);
  await client.close();
});
