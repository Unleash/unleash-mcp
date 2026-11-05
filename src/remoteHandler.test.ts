import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage, request, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { json } from 'node:stream/consumers';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpRequestSummary } from './mcpRequestSummary.ts';
import { createRemoteHandler, type RemoteHandlerOptions } from './remoteHandler.ts';
import { createStubbedFetch } from './unleash/testClient.ts';

const serve = async (
  fetch: typeof globalThis.fetch,
  baseUrl: string,
  options: Omit<RemoteHandlerOptions, 'baseUrl'>,
) => {
  const handle = createRemoteHandler(fetch)({ baseUrl, ...options });
  // Parses the body first, as Unleash's Express does, so the stream is already read when the handler gets it.
  const handleParsed = async (req: IncomingMessage, res: ServerResponse) => {
    const parsedBody = req.method === 'POST' ? await json(req) : undefined;
    return handle(req, res, { authHeaders: { Authorization: 'user-session' }, parsedBody });
  };
  // A summary settles only when the response closes, so the tests await them after the client disconnects.
  const handled: Promise<McpRequestSummary | undefined>[] = [];
  const server = createServer((req, res) => {
    handled.push(handleParsed(req, res));
  });
  await once(server.listen(0), 'listening');
  const requestSummaries = async () => (await Promise.all(handled)).filter((summary) => summary !== undefined);
  return { server, requestSummaries };
};

const connect = async (options: Omit<RemoteHandlerOptions, 'baseUrl'>) => {
  const { baseUrl, fetch, stub } = createStubbedFetch();
  const { server, requestSummaries } = await serve(fetch, baseUrl, options);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${(server.address() as AddressInfo).port}`)),
  );
  const close = async () => {
    await client.close();
    server.close();
  };
  return { client, stub, requestSummaries, close };
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
test('acts in Unleash as the caller, with the auth the host forwards', async (t) => {
  const { client, stub, close } = await connect({ feedbackConsent: 'denied' });
  t.after(close);
  stub
    .intercept({
      path: '/api/admin/projects',
      query: { view: 'core' },
      method: 'GET',
      headers: { authorization: 'user-session' },
    })
    .reply(200, { version: 1, projects: [{ id: 'web', name: 'Web' }] });

  const result = await client.callTool({ name: 'search', arguments: { queries: [{ kind: 'projects' }] } });

  assert.deepEqual(result.structuredContent, {
    results: [{ kind: 'projects', projects: [{ id: 'web', name: 'Web' }] }],
  });
});

test('summarises each request for the host, without tool arguments', async (t) => {
  const { client, stub, requestSummaries, close } = await connect({ feedbackConsent: 'denied' });
  t.after(close);
  stub
    .intercept({ path: (path) => path.startsWith('/api/admin/'), method: 'GET' })
    .reply(403, { name: 'NoAccessError' })
    .times(2);

  await client.callTool({ name: 'search', arguments: { queries: [{ kind: 'projects', query: 'secret-launch' }] } });
  await client.callTool({ name: 'audit', arguments: {} });
  await client.callTool({ name: 'no_such_tool', arguments: {} });
  // The client's open event stream only ends when it disconnects.
  await close();

  assert.deepEqual(await requestSummaries(), [
    { kind: 'initialize', client: { name: 'test-client', version: '0.0.0' }, capabilities: [] },
    { kind: 'other', method: 'notifications/initialized' },
    {
      kind: 'tool_result',
      tool: 'search',
      resultKinds: { failed: 1 },
      errors: [{ name: 'NoAccessError', status: 403 }],
      resultBytes: 80,
    },
    {
      kind: 'tool_result',
      tool: 'audit',
      resultKinds: { failed: 1 },
      errors: [{ name: 'NoAccessError', status: 403 }],
      resultBytes: 77,
    },
    { kind: 'sdk_error', tool: 'unknown' },
  ]);
});

test('summarises a tool call the client hangs up on before the tool replies', async (t) => {
  const hangUp = async () => {
    call.destroy();
    return new Promise<Response>(() => {});
  };
  const { server, requestSummaries } = await serve(hangUp, 'http://unleash.test', { feedbackConsent: 'denied' });
  t.after(() => server.close());
  const call = request({
    port: (server.address() as AddressInfo).port,
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  });
  call.on('error', () => {});

  call.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'audit', arguments: {} } }));
  await once(server, 'request');

  assert.deepEqual(await requestSummaries(), [{ kind: 'no_reply', tool: 'audit' }]);
});

test('summarises a tool call the SDK turns away before any tool runs', async (t) => {
  const { baseUrl, fetch } = createStubbedFetch();
  const { server, requestSummaries } = await serve(fetch, baseUrl, { feedbackConsent: 'denied' });
  t.after(() => server.close());
  const call = request({
    port: (server.address() as AddressInfo).port,
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
  });
  call.on('response', (response) => response.resume());

  call.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'audit', arguments: {} } }));
  await once(server, 'request');

  assert.deepEqual(await requestSummaries(), [{ kind: 'sdk_error', tool: 'audit' }]);
});

test('offers send_feedback when the host has the consent to send it', async () => {
  const tools = await toolNames({ feedbackConsent: 'granted' });

  assert(tools.includes('send_feedback'));
});

test('leaves out send_feedback when the host has no consent to send it', async () => {
  const tools = await toolNames({ feedbackConsent: 'denied' });

  assert(!tools.includes('send_feedback'));
});
