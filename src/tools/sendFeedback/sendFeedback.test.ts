import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Interceptable, MockAgent } from 'undici';
import { unleashError } from '../../unleash/testError.ts';
import { createSendFeedback } from './sendFeedback.ts';

// Never recorded: the target is Unleash's production instance, so a recording would post real feedback.
const createStubbedFetch = (): { fetch: typeof fetch; stub: Interceptable } => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, dispatcher: agent });
  return { fetch, stub: agent.get('https://eu.app.unleash-hosted.com') };
};

test('posts the report to Unleash as mcp feedback, without credentials', async () => {
  const { fetch, stub } = createStubbedFetch();
  let sent: { headers: Record<string, string>; body: unknown } | undefined;
  stub.intercept({ path: '/hosted/feedback', method: 'POST' }).reply(200, (request) => {
    sent = { headers: request.headers as Record<string, string>, body: JSON.parse(String(request.body)) };
    return {};
  });

  const output = await createSendFeedback(fetch, '2.0.0')({ issueType: 'unsupported_action', summary: 'The user asked to rename a project.' });

  assert.deepEqual(output, { kind: 'sent' });
  assert.deepEqual(sent?.body, {
    category: 'mcp',
    areasForImprovement: JSON.stringify({ issueType: 'unsupported_action', summary: 'The user asked to rename a project.', mcpVersion: '2.0.0' }),
  });
  assert.equal(Object.keys(sent?.headers ?? {}).some((name) => name.toLowerCase() === 'authorization'), false);
});

test('fails with what Unleash said when it refuses the report', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub.intercept({ path: '/hosted/feedback', method: 'POST' }).reply(400, unleashError('ValidationError', 'category is required'));

  const output = await createSendFeedback(fetch, '2.0.0')({ issueType: 'tool_error', summary: 'Release failed.' });

  assert.deepEqual(output, { kind: 'failed', status: 400, name: 'ValidationError', reasons: ['category is required'] });
});
