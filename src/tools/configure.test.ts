import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createConfigure } from './configure.ts';

test('applies the changes after a failed one, naming the change each result answers', async () => {
  const { unleash, stub } = createStubbedClient();
  const taken = 'A context field with that name already exist';
  const missing = 'Could not find context field with name region';
  stub.intercept({ path: '/api/admin/context', method: 'POST' }).reply(409, unleashError('NameExistsError', taken));
  stub.intercept({ path: '/api/admin/context/region/legal-values/eu', method: 'DELETE' }).reply(404, unleashError('NotFoundError', missing));
  const configure = createConfigure(unleash);

  const output = await configure({ changes: [
    { kind: 'context_field', action: 'create', name: 'tier' },
    { kind: 'legal_value', action: 'delete', field: 'region', value: 'eu' },
  ] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', resource: 'context_field', action: 'create', name: 'tier', error: { status: 409, name: 'NameExistsError', reasons: [taken] } },
      { kind: 'failed', resource: 'legal_value', action: 'delete', field: 'region', value: 'eu', error: { status: 404, name: 'NotFoundError', reasons: [missing] } },
    ],
  });
});
