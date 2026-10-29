import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manageFlagInput } from './manageFlagInput.ts';

test('refuses values for a parent that must be off, which Unleash would drop', () => {
  const parsed = manageFlagInput.safeParse({
    operations: [
      {
        action: 'set_parent_dependency',
        project: 'web',
        flag: 'checkout-v2',
        parent: { state: 'disabled', flag: 'checkout', values: ['blue'] },
      },
    ],
  });

  assert.deepEqual(
    parsed.error?.issues.map((i) => i.code),
    ['unrecognized_keys'],
  );
});

// The Unleash UI renders a link as an anchor, so a javascript: URL would run in the browser of whoever clicks it.
test('refuses a link that is not an http(s) URL', () => {
  const parsed = manageFlagInput.safeParse({
    operations: [{ action: 'define', project: 'web', flag: 'checkout-v2', links: [{ url: 'javascript:alert(1)' }] }],
  });

  assert.deepEqual(
    parsed.error?.issues.map((i) => i.path.join('.')),
    ['operations.0.links.0.url'],
  );
});
