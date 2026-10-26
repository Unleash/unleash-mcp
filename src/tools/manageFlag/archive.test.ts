import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Interceptable } from 'undici';
import { createRecordedClient, createStubbedClient } from '../../unleash/testClient.ts';
import { unleashError } from '../../unleash/testError.ts';
import { cancelChangeRequest, deleteFlag } from '../../unleash/testSetup.ts';
import { createChangeRequestReader } from '../shared/changeRequest.ts';
import { archiveFlag } from './archive.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./archive.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-archived-flag';
let changeRequestId: number | undefined;

before(async () => {
  await deleteFlag(admin, project, flag);
  await admin.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag } });
});
// The change request goes first, so nothing pending refers to the flag.
after(async () => {
  if (changeRequestId) await cancelChangeRequest(unleash, project, changeRequestId);
  await deleteFlag(admin, project, flag);
  await close();
});

// `mcp-server` requires change requests in production.
test('puts the archiving of a flag in a change request where the project requires one', async () => {
  const output = await archiveFlag(unleash, createChangeRequestReader(unleash), { action: 'archive', project, flag });

  assert(output.kind === 'pending_change_request');
  changeRequestId = output.changeRequest.id;
  assert.equal(output.changeRequest.state, 'In review');
});

const enterprise = { environment: 'Enterprise', versionInfo: { current: { oss: '8.2.0', enterprise: '8.2.1' } } };
const stubNoChangeRequests = (stub: Interceptable) => {
  stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(200, enterprise);
  stub.intercept({ path: '/api/admin/projects/web/change-requests/config', method: 'GET' }).reply(200, []);
};

test('archives a flag directly where the project requires no change requests', async () => {
  const { unleash, stub } = createStubbedClient();
  stubNoChangeRequests(stub);
  stub.intercept({ path: '/api/admin/projects/web/features/checkout', method: 'DELETE' }).reply(202, '');

  const output = await archiveFlag(unleash, createChangeRequestReader(unleash), { action: 'archive', project: 'web', flag: 'checkout' });

  assert.deepEqual(output, { kind: 'applied' });
});

test('fails with the Unleash error when the flag cannot be archived', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'There\'s no feature named "missing" in project "web".';
  stubNoChangeRequests(stub);
  stub.intercept({ path: '/api/admin/projects/web/features/missing', method: 'DELETE' }).reply(404, unleashError('NotFoundError', message));

  const output = await archiveFlag(unleash, createChangeRequestReader(unleash), { action: 'archive', project: 'web', flag: 'missing' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});

// No stub for archiving: archiving without knowing whether it needs approval would fail the test.
test('fails with the Unleash error when the project\'s change request settings cannot be read', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = 'You need the READ_PROJECT permission';
  stub.intercept({ path: '/api/admin/ui-config', method: 'GET' }).reply(200, enterprise);
  stub.intercept({ path: '/api/admin/projects/web/change-requests/config', method: 'GET' }).reply(403, unleashError('PermissionError', message));

  const output = await archiveFlag(unleash, createChangeRequestReader(unleash), { action: 'archive', project: 'web', flag: 'checkout' });

  assert.deepEqual(output, { kind: 'failed', status: 403, name: 'PermissionError', reasons: [message] });
});
