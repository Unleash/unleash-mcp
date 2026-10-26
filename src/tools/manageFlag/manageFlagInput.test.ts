import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { manageFlagInput } from './manageFlagInput.ts';

test('refuses values for a parent that must be off, which Unleash would drop', () => {
  const parsed = z.object(manageFlagInput).safeParse({
    operations: [{ action: 'set_parent_dependency', project: 'web', flag: 'checkout-v2', parent: { kind: 'off', flag: 'checkout', values: ['blue'] } }],
  });

  assert.deepEqual(parsed.error?.issues.map((i) => i.code), ['unrecognized_keys']);
});
