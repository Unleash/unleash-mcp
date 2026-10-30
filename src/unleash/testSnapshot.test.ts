import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcoded } from './testSnapshot.ts';

const entry = (body: string, stamped?: { timestamp: string }) => [
  {
    hash: 'h1',
    snapshot: {
      request: { method: 'GET', url: 'https://unleash.example/api' },
      responses: [{ statusCode: 200, headers: {}, body }],
      callCount: 0,
      ...stamped,
    },
  },
];

const checkedIn = entry('{"name":"flag"}');
const readByUndici = entry('eyJuYW1lIjoiZmxhZyJ9');
const writtenByUndici = entry('eyJuYW1lIjoiZmxhZyJ9', { timestamp: '2026-10-30T08:00:00.000Z' });

test('round-trips bodies between the checked-in text and the base64 undici reads, dropping the recording timestamp', () => {
  assert.deepEqual(transcoded(checkedIn, 'utf8', 'base64'), readByUndici);
  assert.deepEqual(transcoded(writtenByUndici, 'base64', 'utf8'), checkedIn);
});
