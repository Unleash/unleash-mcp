import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRecordedClient, createStubbedClient } from '../unleash/testClient.ts';
import { unleashError } from '../unleash/testError.ts';
import { createLegalValue } from './legalValue.ts';

const { unleash, admin, close } = createRecordedClient(new URL('./legalValue.snapshot.json', import.meta.url).pathname);
// Not the fields in contextField.test.ts: test files run in parallel while recording.
const field = 'mcpLegalValueField';

const deleteField = async (): Promise<void> => {
  await admin.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField: field } } });
};

before(async () => {
  await deleteField();
  await admin.POST('/api/admin/context', { body: { name: field } });
});
after(async () => {
  await deleteField();
  await close();
});

test('adds a legal value to a context field', async () => {
  const output = await createLegalValue(unleash, { kind: 'legal_value', action: 'create', field, value: 'gold', description: 'Paying customers' });

  assert.deepEqual(output, { kind: 'created', resource: 'legal_value', field, value: 'gold' });
});

test('fails with the Unleash error when the context field does not exist', async () => {
  const { unleash, stub } = createStubbedClient();
  const message = `Could not find context field with name ${field}`;
  stub.intercept({ path: `/api/admin/context/${field}/legal-values`, method: 'POST' }).reply(404, unleashError('NotFoundError', message));

  const output = await createLegalValue(unleash, { kind: 'legal_value', action: 'create', field, value: 'gold' });

  assert.deepEqual(output, { kind: 'failed', status: 404, name: 'NotFoundError', reasons: [message] });
});
