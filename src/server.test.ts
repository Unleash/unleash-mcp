import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './server.ts';
import { createUnleashClient } from './unleash/client.ts';

const projects = { version: 1, projects: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] };
const environments = { version: 1, environments: [{ name: 'dev', type: 'development', enabled: true, protected: false, sortOrder: 1 }, { name: 'boom', type: 'development', enabled: true, protected: false, sortOrder: 2 }] };

/** Fake Unleash with two projects, one environment, an existing enabled flag with one strategy. */
const fakeFetch = async (req: Request | string | URL): Promise<Response> => {
  const r = req as Request;
  const path = new URL(r.url).pathname;
  if (path === '/api/admin/projects') return Response.json(projects);
  if (path.startsWith('/api/admin/environments/project/')) return Response.json(environments);
  if (path.endsWith('/change-requests/config')) return Response.json([]);
  if (r.method === 'GET' && path.endsWith('/environments/dev')) return Response.json({ name: 'dev', enabled: true, strategies: [{ id: 'old' }] });
  if (r.method === 'PUT') return Response.json({ id: 'old' });
  if (r.method === 'GET' && path.endsWith('/environments/boom')) return Response.json({ message: 'database down' }, { status: 500 });
  return Response.json({ message: 'not found' }, { status: 404 });
};

const connect = async (): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const unleash = createUnleashClient({ baseUrl: 'https://unleash.example', headers: {}, fetch: fakeFetch as typeof fetch });
  await createServer(unleash).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
};

const text = (result: Awaited<ReturnType<Client['callTool']>>): string => (result.content as { text: string }[])[0]!.text;
const json = (result: Awaited<ReturnType<Client['callTool']>>): unknown => JSON.parse(text(result));

test('client completes the MCP handshake with the server', async () => {
  const client = await connect();
  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});

test('a decision is returned as the tool result', async () => {
  const client = await connect();
  const result = await client.callTool({ name: 'release', arguments: { flag: 'f', targets: [{}] } });
  const expected = { kind: 'decisions', decisions: [{ kind: 'choose', message: 'Which project?', options: ['p1', 'p2'], total: 2 }] };
  assert.deepEqual(result.structuredContent, expected);
  assert.deepEqual(json(result), expected, 'text block carries the same JSON');
  await client.close();
});

test('the next call with the corrected input completes the release', async () => {
  const client = await connect();
  const result = await client.callTool({ name: 'release', arguments: { project: 'p1', flag: 'f', environment: 'dev', targets: [{ rollout: 50 }] } });
  assert.deepEqual(result.structuredContent, { kind: 'released', flag: 'f', environment: 'dev', strategies: ['- 50%'] });
  await client.close();
});

test('an API failure is returned as an error result', async () => {
  const client = await connect();
  const result = await client.callTool({ name: 'release', arguments: { project: 'p1', flag: 'f', environment: 'boom', targets: [{}] } });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { kind: 'failed', error: 'read flag (HTTP 500): database down', applied: [] });
  await client.close();
});
