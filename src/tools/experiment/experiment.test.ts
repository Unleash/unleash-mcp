import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import { stubChangeRequestsIn } from '../../unleash/testChangeRequest.ts';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { cancelChangeRequest, deleteFlag } from '../../unleash/testSetup.ts';
import { createExperiment } from './experiment.ts';
import { experimentInput } from './experimentInput.ts';
import { experimentOutput } from './experimentOutput.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./experiment.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-checkout-experiment';
let changeRequestId: number | undefined;
// The MCP SDK checks every result against the output schema, so a result it doesn't describe never reaches the agent.
const describedByOutputSchema = (result: unknown) => z.object(experimentOutput).safeParse({ result }).error;

const values = [
  { name: 'control', share: 50 },
  { name: 'treatment', share: 50 },
];
const everyone = [{ name: 'Everyone', values }];

// The flag is gone before the tests, so the first one creates it.
before(() => deleteFlag(admin, project, flag));
// The change request goes first, so nothing pending refers to the flag.
after(async () => {
  if (changeRequestId) await cancelChangeRequest(unleash, project, changeRequestId);
  await deleteFlag(admin, project, flag);
  await close();
});

// The recording pins the create as an experiment flag reporting impressions.
test('creates a missing flag and splits everyone across the values', async () => {
  const output = await createExperiment(unleash)({
    project,
    flag: { name: flag, state: 'on' },
    environment: 'development',
    targets: everyone,
  });

  assert.deepEqual(output, {
    kind: 'split',
    flag: { status: 'new', name: flag, state: 'on' },
    environment: 'development',
    targets: [{ name: 'Everyone', rollout: 100, stickiness: 'default', values }],
  });
  assert.equal(describedByOutputSchema(output), undefined);
});

test('stops an existing experiment', async () => {
  const output = await createExperiment(unleash)({
    project,
    flag: { name: flag, state: 'off' },
    environment: 'development',
    targets: everyone,
  });

  assert.partialDeepStrictEqual(output, { kind: 'split', flag: { status: 'existing', state: 'off' } });
});

// `mcp-server` requires change requests in production.
test('puts the experiment in a change request where the environment requires one', async () => {
  const output = await createExperiment(unleash)({
    project,
    flag: { name: flag, state: 'on' },
    environment: 'production',
    targets: everyone,
  });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.equal(output.changeRequest.state, 'In review');
  assert.equal(describedByOutputSchema(output), undefined);
});

// Unleash refuses the create, so the test stops there with the request it was sent.
test('creates the flag without impression data when told not to report them', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, 'web');
  stub
    .intercept({ path: '/api/admin/projects/web/features/checkout-experiment', method: 'GET' })
    .reply(404, unleashError('NotFoundError', 'Could not find feature flag checkout-experiment'));
  let created: unknown;
  stub.intercept({ path: '/api/admin/projects/web/features', method: 'POST' }).reply(403, (request) => {
    created = JSON.parse(String(request.body));
    return unleashError('PermissionError', 'You need the CREATE_FEATURE permission');
  });

  await createExperiment(unleash)({
    project: 'web',
    flag: { name: 'checkout-experiment', state: 'on' },
    environment: 'development',
    targets: everyone,
    impressionData: false,
  });

  assert.deepEqual(created, { name: 'checkout-experiment', type: 'experiment', impressionData: false });
});

test('refuses an audience without values, which would be a release', () => {
  const parsed = experimentInput.safeParse({
    project: 'web',
    flag: { name: 'checkout-experiment', state: 'on' },
    environment: 'development',
    targets: [{ name: 'Everyone' }],
  });

  assert.deepEqual(
    parsed.error?.issues.map((i) => `${i.path.join('.')}: ${i.code}`),
    ['targets.0.values: invalid_type'],
  );
});
