import assert from 'node:assert/strict';
import { test } from 'node:test';
import { target } from './target.ts';

test('refuses shares that do not add up to 100 when every value has one', () => {
  const parsed = target.safeParse({ name: 'Checkout test', values: [{ name: 'control', share: 30 }, { name: 'new', share: 30 }] });

  assert.deepEqual(parsed.error?.issues.map((i) => i.message), ['When every value has a share, the shares must add up to 100']);
});
