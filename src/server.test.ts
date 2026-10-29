import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from './server.ts';
import type { SendFeedback } from './tools/sendFeedback/sendFeedback.ts';
import { reportableTools } from './tools/sendFeedback/sendFeedbackInput.ts';
import type { UnleashClient } from './unleash/client.ts';
import { createRecordedClient, createStubbedClient } from './unleash/testClient.ts';
import { deleteFlag } from './unleash/testSetup.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./server.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
// Not `mcp-flag`: test files run in parallel while recording, and release.test.ts deletes that one.
const flag = 'mcp-server-flag';

// The flag is gone before the test, so the release creates it.
before(() => deleteFlag(admin, project, flag));
after(close);

const connectClient = async (server: UnleashClient = unleash, sendFeedback?: SendFeedback): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(server, sendFeedback).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
};

test('client completes the MCP handshake with the server', async () => {
  const client = await connectClient();

  assert.equal(client.getServerVersion()?.name, 'unleash-mcp');
  await client.close();
});

test('instructions tell the agent what every listed tool is for, with or without the feedback opt-in', async () => {
  const { unleash: stubbed } = createStubbedClient();
  for (const sendFeedback of [undefined, async () => ({ kind: 'sent' as const })]) {
    const client = await connectClient(stubbed, sendFeedback);

    const { tools } = await client.listTools();

    const listed = [...(client.getInstructions() ?? '').matchAll(/^- (\w+): /gm)].map(([, name]) => name);
    assert.deepEqual(listed.sort(), tools.map(({ name }) => name).sort());
    await client.close();
  }
});

test('instructions tell the agent to report without asking only when send_feedback is listed', async () => {
  const { unleash: stubbed } = createStubbedClient();
  for (const [sendFeedback, told] of [
    [undefined, false],
    [async () => ({ kind: 'sent' as const }), true],
  ] as const) {
    const client = await connectClient(stubbed, sendFeedback);

    const instructions = client.getInstructions() ?? '';

    assert.equal(instructions.includes('call send_feedback before replying, without asking the user'), told);
    await client.close();
  }
});

test('release tool reports the targets', async () => {
  const client = await connectClient();

  const result = await client.callTool({
    name: 'release',
    arguments: {
      project,
      flag: { name: flag, state: 'enabled' },
      environment: 'development',
      audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
    },
  });

  assert.deepEqual(result.structuredContent, {
    result: {
      kind: 'released',
      flag: { origin: 'created', name: flag, state: 'enabled' },
      environment: 'development',
      targets: [{ name: 'Everyone', rollout: 50, stickiness: 'default' }],
    },
  });
  await client.close();
});

test('release tool reports a failure as text', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  const message = 'You need the "SKIP_CHANGE_REQUEST" permission.';
  stub
    .intercept({ path: '/api/admin/ui-config', method: 'GET' })
    .reply(200, { versionInfo: { current: { enterprise: '' } } });
  stub
    .intercept({ path: `/api/admin/projects/${project}/features/${flag}`, method: 'GET' })
    .reply(403, { name: 'PermissionError', message, details: [{ message }] });
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'release',
    arguments: {
      project,
      flag: { name: flag, state: 'enabled' },
      environment: 'development',
      audience: { targets: [{ name: 'Everyone', rollout: 50 }] },
    },
  });

  const failed = { result: { kind: 'failed', status: 403, name: 'PermissionError', reasons: [message] } };
  assert.deepEqual(result, { isError: true, content: [{ type: 'text', text: JSON.stringify(failed) }] });
  await client.close();
});

test('refuses a tool call whose arguments hold more than 10,000 elements', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'inspect',
    arguments: { queries: Array(10_001).fill({ kind: 'segment', id: 7 }) },
  });

  assert.deepEqual(result, {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'MCP error -32602: Invalid arguments for tool inspect: arguments contain more than the maximum of 10000 elements',
      },
    ],
  });
  await client.close();
});

test('configure tool reports each change', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  const message = 'A context field with that name already exist';
  stub
    .intercept({ path: '/api/admin/context', method: 'POST' })
    .reply(409, { name: 'NameExistsError', message, details: [{ message }] });
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'configure',
    arguments: { changes: [{ kind: 'context_field', action: 'create', name: 'tier' }] },
  });

  assert.deepEqual(result.structuredContent, {
    results: [
      {
        kind: 'failed',
        resource: 'context_field',
        action: 'create',
        name: 'tier',
        error: { status: 409, name: 'NameExistsError', reasons: [message] },
      },
    ],
  });
  await client.close();
});

test('inspect tool returns its results as structured content and as text', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub
    .intercept({ path: `/api/admin/projects/${project}/overview`, method: 'GET' })
    .reply(200, { name: project, mode: 'open', environments: [{ environment: 'development' }] });
  const client = await connectClient(stubbed);

  const result = await client.callTool({ name: 'inspect', arguments: { queries: [{ kind: 'project', project }] } });

  const results = {
    results: [
      { kind: 'project', name: project, mode: 'open', environments: ['development'], defaultStickiness: 'default' },
    ],
  };
  assert.deepEqual(result, { structuredContent: results, content: [{ type: 'text', text: JSON.stringify(results) }] });
  await client.close();
});

test('search tool returns its results as structured content', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  stub.intercept({ path: '/api/admin/segments', method: 'GET' }).reply(200, {
    segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFeatures: 3 }],
  });
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'search',
    arguments: { queries: [{ kind: 'segments', query: 'beta' }] },
  });

  assert.deepEqual(result.structuredContent, {
    results: [
      {
        kind: 'segments',
        segments: [{ id: 1, name: 'Beta', createdAt: '2026-10-22T08:00:00.000Z', usedInProjects: 2, usedInFlags: 3 }],
      },
    ],
  });
  await client.close();
});

test('evaluate tool asks as the unleash-mcp app when no context is given', async () => {
  const { unleash: stubbed, stub } = createStubbedClient();
  const body = JSON.stringify({ environment: 'development', context: { appName: 'unleash-mcp' } });
  stub
    .intercept({ path: `/api/admin/playground/features/${flag}`, method: 'POST', body })
    .reply(200, { feature: { isEnabled: true, isEnabledInCurrentEnvironment: true, strategies: { data: [] } } });
  const client = await connectClient(stubbed);

  const result = await client.callTool({
    name: 'evaluate',
    arguments: { queries: [{ flag, environment: 'development' }] },
  });

  assert.deepEqual(result.structuredContent, {
    results: [{ kind: 'evaluated', flag, environment: 'development', result: 'enabled' }],
  });
  await client.close();
});

test('send_feedback is not listed when the user opted out', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const client = await connectClient(stubbed);

  const { tools } = await client.listTools();

  assert.equal(
    tools.some((tool) => tool.name === 'send_feedback'),
    false,
  );
  await client.close();
});

test('send_feedback tool returns its result as structured content', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const client = await connectClient(stubbed, async () => ({ kind: 'sent' }));

  const result = await client.callTool({
    name: 'send_feedback',
    arguments: { issueType: 'unsupported_action', summary: 'The user asked to rename a project.' },
  });

  assert.deepEqual(result.structuredContent, { result: { kind: 'sent' } });
  await client.close();
});

test('send_feedback can name every other tool the server lists', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const client = await connectClient(stubbed, async () => ({ kind: 'sent' }));

  const { tools } = await client.listTools();

  assert.deepEqual(
    tools
      .map((tool) => tool.name)
      .filter((name) => name !== 'send_feedback')
      .sort(),
    [...reportableTools].sort(),
  );
  await client.close();
});

// Checks the schemas the agent sees; any tool not marked read-only counts as writing, so new ones are covered.
// Feedback is on, so send_feedback is listed too.
test('tools that write list inputs that refuse unknown keys at every level', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const client = await connectClient(stubbed, async () => ({ kind: 'sent' }));

  const { tools } = await client.listTools();
  const lenient = tools.filter(writes).flatMap(lenientObjects);

  assert.deepEqual(lenient, []);
  await client.close();
});

const writes = ({ annotations }: Tool): boolean => !annotations?.readOnlyHint;

// The paths of the objects in a tool's input that accept keys they don't list.
const lenientObjects = ({ name, inputSchema }: Tool): string[] => {
  const walk = (schema: unknown, path: string): string[] => {
    if (typeof schema !== 'object' || schema === null) return [];
    const { type, additionalProperties } = schema as { type?: unknown; additionalProperties?: unknown };
    const here = type === 'object' && additionalProperties !== false ? [path] : [];
    return [...here, ...Object.entries(schema).flatMap(([key, value]) => walk(value, `${path}/${key}`))];
  };
  return walk(inputSchema, name);
};

test('send_feedback names the client the agent connected with', async () => {
  const { unleash: stubbed } = createStubbedClient();
  let reportedClient: unknown;
  const client = await connectClient(stubbed, async (_input, connected) => {
    reportedClient = connected.info;
    return { kind: 'sent' };
  });

  await client.callTool({
    name: 'send_feedback',
    arguments: { issueType: 'unsupported_action', summary: 'The user asked to rename a project.' },
  });

  assert.deepEqual(reportedClient, { name: 'test-client', version: '0.0.0' });
  await client.close();
});

test('send_feedback asks for consent through the client the agent runs in', async () => {
  const { unleash: stubbed } = createStubbedClient();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(stubbed, async (_input, { ask }) =>
    (await ask('Send reports?')) === 'granted' ? { kind: 'sent' } : { kind: 'disabled' },
  ).connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' }, { capabilities: { elicitation: {} } });
  client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'accept', content: {} }));
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: 'send_feedback',
    arguments: { issueType: 'unsupported_action', summary: 'The user asked to rename a project.' },
  });

  assert.deepEqual(result.structuredContent, { result: { kind: 'sent' } });
  await client.close();
});
