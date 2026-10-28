import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffEventData } from './diff.ts';

test('writes the path to a changed value as a person would, with the value before and after', () => {
  const before = { parameters: { rollout: '50', stickiness: 'default' } };
  const after = { parameters: { rollout: '100', stickiness: 'default' } };

  assert.deepEqual(diffEventData(before, after), [{ path: 'parameters.rollout', before: '50', after: '100' }]);
});

test('ignores fields that change without anyone editing them, and ids', () => {
  const before = { enabled: true, lastSeenAt: '2026-01-01T00:00:00Z', createdAt: '2025-01-01' };
  const after = {
    id: '01M5YES4QANN36N0SV5RKHT236',
    enabled: true,
    lastSeenAt: '2026-10-15T00:00:00Z',
    createdAt: '2025-06-01',
  };

  assert.deepEqual(diffEventData(before, after), []);
});

test('lists every field as added when there was nothing before', () => {
  assert.deepEqual(diffEventData(undefined, { type: 'release', enabled: false }), [
    { path: 'type', after: 'release' },
    { path: 'enabled', after: false },
  ]);
});

test('leaves out empty values added or removed, which say nothing was set', () => {
  const before = { title: 'Beta', segments: [1] };
  const after = { name: 'flexibleRollout', title: null, constraints: [], parameters: {}, segments: [] };

  assert.deepEqual(diffEventData(before, after), [
    { path: 'title', before: 'Beta', after: null },
    { path: 'segments[0]', before: 1 },
    { path: 'name', after: 'flexibleRollout' },
  ]);
});

test('diffs data that is not an object as a whole value', () => {
  assert.deepEqual(diffEventData('Beta', 'Beta testers'), [{ path: 'value', before: 'Beta', after: 'Beta testers' }]);
});
