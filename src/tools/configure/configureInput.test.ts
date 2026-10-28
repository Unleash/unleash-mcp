import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureInput } from './configureInput.ts';

test('refuses a change with a key it does not take, such as values for legal values', () => {
  const parsed = configureInput.safeParse({ changes: [{ kind: 'context_field', action: 'create', name: 'tier', values: [{ value: 'gold' }] }] });

  assert.equal(parsed.success, false);
});
