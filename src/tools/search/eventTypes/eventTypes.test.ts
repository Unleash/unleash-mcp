import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchEventTypes } from './eventTypes.ts';

test('finds event types by a part of their name, case insensitive', () => {
  const output = searchEventTypes({ kind: 'event_types', query: 'ENVIRONMENT-EN' });

  assert.deepEqual(output, { kind: 'event_types', eventTypes: ['feature-environment-enabled'] });
});

test('lists every event type when no text is given', () => {
  const output = searchEventTypes({ kind: 'event_types' });

  assert(output.eventTypes.includes('feature-created'));
  assert(output.eventTypes.includes('segment-updated'));
});
