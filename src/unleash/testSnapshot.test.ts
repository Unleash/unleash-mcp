import assert from 'node:assert/strict';
import { test } from 'node:test';
import { masked, sorted, transcoded } from './testSnapshot.ts';

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

test('replaces the email addresses Unleash answers with by a pseudonym per address', () => {
  const recorded = entry('{"createdBy":"ada@example.org","members":["ada@example.org","bob@example.org"]}');

  const [{ snapshot }] = masked(recorded);

  assert.equal(
    snapshot.responses[0]?.body,
    '{"createdBy":"user-cfe00d@example.com","members":["user-cfe00d@example.com","user-686b5e@example.com"]}',
  );
});

const request = (method: string, url: string, body?: string) => ({
  hash: `${method} ${url}`,
  snapshot: { request: { method, url, body }, responses: [], callCount: 0 },
});

test('orders entries by request, so a recording does not depend on which response arrived first', () => {
  const flag = request('GET', 'https://unleash.example/features/a');
  const project = request('GET', 'https://unleash.example/projects/p');
  const create = request('POST', 'https://unleash.example/features', '{"name":"a"}');

  assert.deepEqual(sorted([project, create, flag]), [flag, project, create]);
});
