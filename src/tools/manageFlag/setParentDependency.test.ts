import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { production, stubChangeRequestsIn } from '../../unleash/testChangeRequest.ts';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { cancelChangeRequest, deleteFlag } from '../../unleash/testSetup.ts';
import { createChangeRequestReader } from '../shared/changeRequest.ts';
import { defineFlag } from './define.ts';
import { setParentDependency } from './setParentDependency.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./setParentDependency.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const parent = 'mcp-parent-flag';
const child = 'mcp-child-flag';
let changeRequestId: number | undefined;

before(async () => {
  await deleteFlag(admin, project, child);
  await deleteFlag(admin, project, parent);
  await defineFlag(admin, { action: 'define', project, flag: parent });
  await defineFlag(admin, { action: 'define', project, flag: child });
});
// The change request goes first, so nothing pending refers to the flags.
after(async () => {
  if (changeRequestId) await cancelChangeRequest(unleash, project, changeRequestId);
  await deleteFlag(admin, project, child);
  await deleteFlag(admin, project, parent);
  await close();
});

// `mcp-server` requires change requests in production. The recording pins the change Unleash accepted.
test('puts the parent of a flag in a change request where the project requires one', async () => {
  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project, flag: child, parent: { kind: 'on', flag: parent } });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.equal(output.changeRequest.state, 'In review');
});

const dependencies = '/api/admin/projects/web/features/checkout-v2/dependencies';

// Only the exact body matches, so a parent sent in another shape fails the test.
test('makes a flag depend on its parent serving one of the given values', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, 'web');
  const onWithValues = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { feature: 'checkout', enabled: true, variants: ['blue'] });
  stub.intercept({ path: dependencies, method: 'POST', body: onWithValues }).reply(200, '');

  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'on', flag: 'checkout', values: ['blue'] } });

  assert.deepEqual(output, { kind: 'applied' });
});

test('makes a flag depend on its parent being off', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, 'web');
  const off = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { feature: 'checkout', enabled: false });
  stub.intercept({ path: dependencies, method: 'POST', body: off }).reply(200, '');

  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'off', flag: 'checkout' } });

  assert.deepEqual(output, { kind: 'applied' });
});

test('stops a flag depending on its parent', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, 'web');
  stub.intercept({ path: dependencies, method: 'DELETE' }).reply(200, '');

  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'none' } });

  assert.deepEqual(output, { kind: 'applied' });
});

// Only the removal matches, so a change request with another change fails the test.
test('puts the removal of a parent in a change request where the project requires one', async () => {
  const { unleash, stub } = createStubbedClient();
  stubChangeRequestsIn(stub, 'web', production);
  const removal = (body: string): boolean => isDeepStrictEqual(JSON.parse(body), { feature: 'checkout-v2', action: 'deleteDependency' });
  stub.intercept({ path: '/api/admin/projects/web/environments/production/change-requests', method: 'POST', body: removal }).reply(200, { id: 7, state: 'In review' });

  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'none' } });

  assert.partialDeepStrictEqual(output, { kind: 'pending_change_request', changeRequest: { id: 7 } });
});

test('fails with the Unleash error when the parent is refused', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'Transitive dependency detected. Cannot add a dependency to the feature that has parent dependency.';
  stubChangeRequestsIn(stub, 'web');
  stub.intercept({ path: dependencies, method: 'POST' }).reply(403, unleashError('InvalidOperationError', message));

  const output = await setParentDependency(unleash, createChangeRequestReader(unleash), { action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'on', flag: 'checkout' } });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'InvalidOperationError', reasons: [message] });
});
