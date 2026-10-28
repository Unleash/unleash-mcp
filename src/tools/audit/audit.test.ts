import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { deleteFlag } from '../../unleash/testSetup.ts';
import { createAudit } from './audit.ts';
import { auditInput } from './auditInput.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./audit.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-audited-flag';
// Parsed as the MCP SDK does, so the defaults apply.
const input = z.object(auditInput);
// The flag's creation time, as recorded: replays ask for the same days the recording did.
let recordedAt: Date;
const notToday = (): Date => assert.fail('the last day was given, so today is not needed');
const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
const dayBefore = (date: Date): string => dayOf(new Date(date.getTime() - 24 * 60 * 60 * 1000));

before(async () => {
  await deleteFlag(admin, project, flag);
  const created = await admin.POST('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
    body: { name: flag },
  });
  assert(created.data?.createdAt);
  recordedAt = new Date(created.data.createdAt);
  await admin.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on', {
    params: { path: { projectId: project, featureName: flag, environment: 'development' } },
  });
});
after(async () => {
  await deleteFlag(admin, project, flag);
  await close();
});

// A deleted flag keeps its history, so earlier recordings add older changes: only the most recent ones are asserted.
// Turning an environment on with no targets adds Unleash's default one first.
test('lists the changes to a flag since yesterday, most recent first, with who made them and where', async () => {
  const output = await createAudit(unleash, () => recordedAt)(input.parse({ flag: [flag] }));

  assert(output.kind === 'changes');
  assert.deepEqual([output.from, output.to], [dayBefore(recordedAt), dayOf(recordedAt)]);
  assert.partialDeepStrictEqual(output.changes.slice(0, 2), [
    {
      type: 'feature-environment-enabled',
      changedBy: 'mateusz@getunleash.ai',
      project,
      flag,
      environment: 'development',
    },
    { type: 'feature-strategy-add', changedBy: 'mateusz@getunleash.ai', project, flag, environment: 'development' },
  ]);
  // Turning the environment on and adding its default target were one request, so one group.
  assert(output.changes[0]?.groupId);
  assert.equal(output.changes[0].groupId, output.changes[1]?.groupId);
  assert(!('diff' in output.changes[0]));
});

test('keeps the changes made in any of the environments asked of a project over the days asked', async () => {
  const to = dayOf(recordedAt);

  const output = await createAudit(
    unleash,
    notToday,
  )(input.parse({ project: [project], environment: ['development', 'production'], to, days: 3 }));

  assert(output.kind === 'changes');
  assert(output.changes.some((change) => change.flag === flag && change.type === 'feature-environment-enabled'));
  assert(
    output.changes.every(
      (change) => change.project === project && ['development', 'production'].includes(change.environment ?? ''),
    ),
  );
});

test('keeps the changes of the event types asked, whatever their case', async () => {
  const output = await createAudit(
    unleash,
    () => recordedAt,
  )(input.parse({ flag: [flag], type: ['Feature-Strategy-Add'] }));

  assert(output.kind === 'changes');
  assert(output.changes.length > 0);
  assert(output.changes.every((change) => change.type === 'feature-strategy-add'));
});

test('shows the values a change edited when the diff is included', async () => {
  const output = await createAudit(
    unleash,
    () => recordedAt,
  )(input.parse({ flag: [flag], type: ['feature-strategy-add'], include: ['diff'] }));

  // One field shows the diff reads from before to after; diff.test.ts covers the rest.
  assert(output.kind === 'changes');
  assert.deepEqual(
    output.changes[0]?.diff?.find((field) => field.path === 'name'),
    { path: 'name', after: 'flexibleRollout' },
  );
});

test('refuses more than 31 days', () => {
  assert.throws(() => input.parse({ days: 32 }), /expected number to be <=31/);
});

test('fails with the Unleash error when the changes cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  stub
    .intercept({ path: (path) => path.startsWith('/api/admin/search/events'), method: 'GET' })
    .reply(500, unleashError('UnknownError', 'connect ECONNREFUSED 10.0.0.5:5432'));

  const output = await createAudit(unleash, notToday)(input.parse({ flag: [flag], to: '2026-10-27' }));

  assert.deepEqual(output, {
    kind: 'failed',
    status: 500,
    name: 'UnknownError',
    reasons: ['connect ECONNREFUSED 10.0.0.5:5432'],
  });
});
