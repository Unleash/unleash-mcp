import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Interceptable, MockAgent } from 'undici';
import { z } from 'zod';
import { unleashError } from '../../unleash/testError.ts';
import { createSendFeedback } from './sendFeedback.ts';
import { sendFeedbackInput } from './sendFeedbackInput.ts';

// Never recorded: the target is Unleash's production instance, so a recording would post real feedback.
const createStubbedFetch = (): { fetch: typeof fetch; stub: Interceptable } => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, dispatcher: agent });
  return { fetch, stub: agent.get('https://eu.app.unleash-hosted.com') };
};

type Posted = { headers: Record<string, string>; body: { category: string; areasForImprovement: string } };

// Accepts the report and keeps what was posted, for the test to read once the call is done.
const acceptReport = (stub: Interceptable): (() => Posted | undefined) => {
  let posted: Posted | undefined;
  stub.intercept({ path: '/hosted/feedback', method: 'POST' }).reply(200, (request) => {
    posted = { headers: request.headers as Record<string, string>, body: JSON.parse(String(request.body)) };
    return {};
  });
  return () => posted;
};

test('posts the report to Unleash as mcp feedback, without credentials', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  const output = await createSendFeedback(fetch, '2.0.0')({ issueType: 'unsupported_action', summary: 'The user asked to rename a project.' });

  assert.deepEqual(output, { kind: 'sent' });
  assert.deepEqual(posted()?.body, {
    category: 'mcp',
    areasForImprovement: JSON.stringify({ issueType: 'unsupported_action', summary: 'The user asked to rename a project.', mcpVersion: '2.0.0' }),
  });
  assert.equal(Object.keys(posted()?.headers ?? {}).some((name) => name.toLowerCase() === 'authorization'), false);
});

test('names the tool that failed and how in the report', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  await createSendFeedback(fetch, '2.0.0')({ issueType: 'tool_error', summary: 'Release failed.', tool: 'release', error: { status: 409, name: 'NameExistsError' } });

  assert.deepEqual(JSON.parse(posted()?.body.areasForImprovement ?? ''), {
    issueType: 'tool_error',
    summary: 'Release failed.',
    tool: 'release',
    error: { status: 409, name: 'NameExistsError' },
    mcpVersion: '2.0.0',
  });
});

test('names the client the agent runs in, cleaned to a short, plain value', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  await createSendFeedback(fetch, '2.0.0')({ issueType: 'tool_error', summary: 'Release failed.' }, { name: ' claude-code (cli);\n', version: `2.0.0${'0'.repeat(70)}` });

  assert.partialDeepStrictEqual(JSON.parse(posted()?.body.areasForImprovement ?? ''), { client: 'claude-code cli', clientVersion: `2.0.0${'0'.repeat(59)}` });
});

test('leaves the client out when its name or version is empty once cleaned', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  await createSendFeedback(fetch, '2.0.0')({ issueType: 'tool_error', summary: 'Release failed.' }, { name: 'claude-code', version: '();' });

  assert.deepEqual(JSON.parse(posted()?.body.areasForImprovement ?? ''), { issueType: 'tool_error', summary: 'Release failed.', mcpVersion: '2.0.0' });
});

test('refuses an error message in place of the error name, so it never reaches the report', () => {
  const input = z.object(sendFeedbackInput);

  const parsed = input.safeParse({ issueType: 'tool_error', summary: 'Release failed.', error: { status: 403, name: 'You need the "UPDATE_FEATURE" permission.' } });

  assert.equal(parsed.success, false);
});

test('fails with what Unleash said when it refuses the report', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub.intercept({ path: '/hosted/feedback', method: 'POST' }).reply(400, unleashError('ValidationError', 'category is required'));

  const output = await createSendFeedback(fetch, '2.0.0')({ issueType: 'tool_error', summary: 'Release failed.' });

  assert.deepEqual(output, { kind: 'failed', status: 400, name: 'ValidationError', reasons: ['category is required'] });
});
