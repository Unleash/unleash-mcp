import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteHandler, type RemoteHandlerOptions } from './remoteHandler.ts';
import { createStubbedFetch } from './unleash/testClient.ts';

const serve = async (fetch: typeof globalThis.fetch, baseUrl: string, options: Omit<RemoteHandlerOptions, 'baseUrl'>) => {
  const handle = createRemoteHandler(fetch)({ baseUrl, ...options });
  const server = createServer((req, res) => void handle(req, res, { authHeaders: { Authorization: 'user-session' } }));
  await once(server.listen(0), 'listening');
  return server;
};

const connect = async (options: Omit<RemoteHandlerOptions, 'baseUrl'> = {}) => {
  const { baseUrl, fetch, stub } = createStubbedFetch();
  const server = await serve(fetch, baseUrl, options);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${(server.address() as AddressInfo).port}`)));
  const close = async () => {
    await client.close();
    server.close();
  };
  return { client, stub, close };
};

const toolNames = async (options: Omit<RemoteHandlerOptions, 'baseUrl'>) => {
  const { client, close } = await connect(options);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await close();
  }
};

// Stubbed although it is a happy path: snapshots ignore the authorization header, so only a stub can check it is forwarded.
test('calls Unleash as the caller, with the auth the host forwards', async () => {
  const { client, stub, close } = await connect();
  stub.intercept({ path: '/api/admin/projects', query: { view: 'core' }, method: 'GET', headers: { authorization: 'user-session' } })
    .reply(200, { version: 1, projects: [{ id: 'web', name: 'Web' }] });
  try {
    const result = await client.callTool({ name: 'search', arguments: { queries: [{ kind: 'projects' }] } });

    assert.deepEqual(result.structuredContent, { results: [{ kind: 'projects', projects: [{ id: 'web', name: 'Web' }] }] });
  } finally {
    await close();
  }
});

test('offers send_feedback when the host has the consent to send it', async () => {
  const tools = await toolNames({ feedbackConsent: 'granted' });

  assert(tools.includes('send_feedback'));
});

test('leaves out send_feedback when the host has no consent to send it', async () => {
  const tools = await toolNames({ feedbackConsent: 'denied' });

  assert(!tools.includes('send_feedback'));
});
