import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createConfigure } from './configure.ts';

test('applies the changes after a failed one, answering each in order', async () => {
  const { unleash, stub } = createStubbedClient();
  const taken = 'A context field with that name already exist';
  const denied = 'You need the "CREATE_CONTEXT_FIELD" permission.';
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(409, unleashError('NameExistsError', taken));
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(403, unleashError('PermissionError', denied));
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [
    { kind: 'context_field', action: 'create', name: 'tier' },
    { kind: 'context_field', action: 'create', name: 'region' },
  ] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 409, name: 'NameExistsError', reasons: [taken] },
      { kind: 'failed', status: 403, name: 'PermissionError', reasons: [denied] },
    ],
  });
});
