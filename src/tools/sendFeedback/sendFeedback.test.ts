import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Interceptable, MockAgent } from 'undici';
import { unleashError } from '../../unleash/testError.ts';
import { type AskUser, type Consent, granted } from './consent.ts';
import { createSendFeedback } from './sendFeedback.ts';
import { sendFeedbackInput } from './sendFeedbackInput.ts';

// Never recorded: a recording would post real feedback.
const createStubbedFetch = (origin = 'https://feedback.example.com'): { fetch: typeof fetch; stub: Interceptable } => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, dispatcher: agent });
  return { fetch, stub: agent.get(origin) };
};

const feedbackBaseUrl = 'https://feedback.example.com/hosted';

// The user consented through the environment, so nothing asks them.
const ask: AskUser = () => assert.fail('the user was asked');

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

  const output = await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'unsupported_action', summary: 'The user asked to rename a project.' },
    { ask },
  );

  assert.deepEqual(output, { kind: 'sent' });
  assert.deepEqual(posted()?.body, {
    category: 'mcp',
    areasForImprovement: JSON.stringify({
      issueType: 'unsupported_action',
      summary: 'The user asked to rename a project.',
      mcpVersion: '2.0.0',
    }),
  });
  assert.equal(
    Object.keys(posted()?.headers ?? {}).some((name) => name.toLowerCase() === 'authorization'),
    false,
  );
});

test('posts to the feedback instance even when its URL ends in a slash', async () => {
  const { fetch, stub } = createStubbedFetch('https://sandbox.getunleash.io');
  stub.intercept({ path: '/enterprise/feedback', method: 'POST' }).reply(200, {});

  const output = await createSendFeedback({
    fetch,
    mcpVersion: '2.0.0',
    feedbackBaseUrl: 'https://sandbox.getunleash.io/enterprise/',
    consent: granted,
  })({ issueType: 'unsupported_action', summary: 'The user asked to rename a project.' }, { ask });

  assert.deepEqual(output, { kind: 'sent' });
});

test('fails without asking the user or calling anything when no feedback instance is configured', async () => {
  const fetch: typeof globalThis.fetch = () => assert.fail('no feedback instance to call');

  const output = await createSendFeedback({
    fetch,
    mcpVersion: '2.0.0',
    feedbackBaseUrl: undefined,
    consent: () => assert.fail('the user was asked'),
  })({ issueType: 'tool_error', summary: 'Release failed.' }, { ask });

  assert.deepEqual(output, {
    kind: 'failed',
    status: 0,
    name: 'NotConfigured',
    reasons: ['No feedback instance is configured: set UNLEASH_FEEDBACK_URL'],
  });
});

test('tells the agent feedback is off, without posting, when the user does not consent', async () => {
  const fetch: typeof globalThis.fetch = () => assert.fail('the report was posted');
  let askedIn: string | undefined;
  const denied: Consent = async ({ name }) => {
    askedIn = name;
    return 'denied';
  };

  const output = await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: denied })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { info: { name: 'claude-code', version: '2.0.0' }, ask },
  );

  assert.deepEqual(output, { kind: 'disabled' });
  assert.equal(askedIn, 'claude-code');
});

test('names the tool that failed and how in the report', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    {
      issueType: 'tool_error',
      summary: 'Release failed.',
      tool: 'release',
      error: { status: 409, name: 'NameExistsError' },
    },
    { ask },
  );

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

  await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { info: { name: ' claude-code (cli);\n', version: `2.0.0${'0'.repeat(70)}` }, ask },
  );

  assert.partialDeepStrictEqual(JSON.parse(posted()?.body.areasForImprovement ?? ''), {
    client: 'claude-code cli',
    clientVersion: `2.0.0${'0'.repeat(59)}`,
  });
});

test('leaves the client out when its name or version is empty once cleaned', async () => {
  const { fetch, stub } = createStubbedFetch();
  const posted = acceptReport(stub);

  await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { info: { name: 'claude-code', version: '();' }, ask },
  );

  assert.deepEqual(JSON.parse(posted()?.body.areasForImprovement ?? ''), {
    issueType: 'tool_error',
    summary: 'Release failed.',
    mcpVersion: '2.0.0',
  });
});

test('refuses an error message in place of the error name, so it never reaches the report', () => {
  const parsed = sendFeedbackInput.safeParse({
    issueType: 'tool_error',
    summary: 'Release failed.',
    error: { status: 403, name: 'You need the "UPDATE_FEATURE" permission.' },
  });

  assert.equal(parsed.success, false);
});

test('fails with what Unleash said when it refuses the report', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub
    .intercept({ path: '/hosted/feedback', method: 'POST' })
    .reply(400, unleashError('ValidationError', 'category is required'));

  const output = await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { ask },
  );

  assert.deepEqual(output, { kind: 'failed', status: 400, name: 'ValidationError', reasons: ['category is required'] });
});

test('fails as a network error when Unleash cannot be reached', async () => {
  const { fetch, stub } = createStubbedFetch();
  stub
    .intercept({ path: '/hosted/feedback', method: 'POST' })
    .replyWithError(new Error('getaddrinfo ENOTFOUND feedback.example.com'));

  const output = await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { ask },
  );

  assert.deepEqual(output, {
    kind: 'failed',
    status: 0,
    name: 'NetworkError',
    reasons: ['fetch failed', 'getaddrinfo ENOTFOUND feedback.example.com'],
  });
});

test('fails as a network error when Unleash does not answer in time', async () => {
  // Rejects as fetch does once the timeout fires, so the test needn't wait for it.
  const fetch: typeof globalThis.fetch = () =>
    Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

  const output = await createSendFeedback({ fetch, mcpVersion: '2.0.0', feedbackBaseUrl, consent: granted })(
    { issueType: 'tool_error', summary: 'Release failed.' },
    { ask },
  );

  assert.deepEqual(output, {
    kind: 'failed',
    status: 0,
    name: 'NetworkError',
    reasons: ['The operation was aborted due to timeout'],
  });
});
