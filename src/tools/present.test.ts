import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageOptions, present } from './present.ts';

test('pageOptions pages and filters long option lists', () => {
  const many = Array.from({ length: 45 }, (_, i) => `p${i}`);
  assert.deepEqual(pageOptions(many, {}), { options: many.slice(0, 20), total: 45, page: 1, pages: 3 });
  assert.deepEqual(pageOptions(many, { page: 3 }).options, ['p40', 'p41', 'p42', 'p43', 'p44']);
  assert.deepEqual(pageOptions(many, { search: 'P4' }), { options: ['p4', 'p40', 'p41', 'p42', 'p43', 'p44'], total: 6 });
  assert.deepEqual(pageOptions(['dev', 'prod'], { search: 'zzz' }).options, ['dev', 'prod'], 'a search matching nothing shows the full list');
});

test('present returns the result as structured content, option lists paged, and the same JSON as text', () => {
  const r = present({ kind: 'decisions', decisions: [
    { kind: 'confirm', id: 'createFlag', message: 'Create it?' },
    { kind: 'choose', message: 'Which one?', options: ['a', 'b'] },
  ] }, {});
  assert.deepEqual(r.structuredContent, { kind: 'decisions', decisions: [
    { kind: 'confirm', id: 'createFlag', message: 'Create it?' },
    { kind: 'choose', message: 'Which one?', options: ['a', 'b'], total: 2 },
  ] });
  assert.equal(r.content[0]!.text, JSON.stringify(r.structuredContent));
  assert.equal(r.isError, false);
});

test('a failure is an error result', () => {
  const r = present({ kind: 'failed', error: 'boom', applied: [] }, {});
  assert.equal(r.isError, true);
  assert.deepEqual(r.structuredContent, { kind: 'failed', error: 'boom', applied: [] });
});
