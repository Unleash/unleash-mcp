import assert from 'node:assert/strict';
import { test } from 'node:test';
import { masked, sorted, transcoded } from './testSnapshot.ts';

const entry = ({
  body,
  url = 'https://unleash.example/api',
  timestamp,
}: {
  body: string;
  url?: string;
  timestamp?: string;
}) => [
  {
    hash: 'h1',
    snapshot: {
      request: { method: 'GET', url },
      responses: [{ statusCode: 200, headers: {}, body }],
      callCount: 0,
      ...(timestamp && { timestamp }),
    },
  },
];

const checkedIn = entry({ body: '{"name":"flag"}' });
const readByUndici = entry({ body: 'eyJuYW1lIjoiZmxhZyJ9' });
const writtenByUndici = entry({ body: 'eyJuYW1lIjoiZmxhZyJ9', timestamp: '2026-10-30T08:00:00.000Z' });

test('round-trips bodies between the checked-in text and the base64 undici reads, dropping the recording timestamp', () => {
  assert.deepEqual(transcoded(checkedIn, 'utf8', 'base64'), readByUndici);
  assert.deepEqual(transcoded(writtenByUndici, 'base64', 'utf8'), checkedIn);
});

test('replaces the email addresses Unleash answers with by a pseudonym per address, and an IP address by a reserved one', () => {
  const recorded = entry({
    body: '{"createdBy":"ada@example.org","members":["ada@example.org","bob@example.org"],"ip":"198.51.100.7"}',
  });

  const [{ snapshot }] = masked(recorded);

  assert.equal(
    snapshot.responses[0]?.body,
    '{"createdBy":"user-cfe00d@example.com","members":["user-cfe00d@example.com","user-686b5e@example.com"],"ip":"192.0.2.1"}',
  );
});

test('keeps only the test projects of a projects listing', () => {
  const recorded = entry({
    url: 'https://unleash.example/enterprise/api/admin/projects?view=core',
    body: '{"version":1,"projects":[{"id":"mcp-search-projects","name":"mcp-search-projects"},{"id":"default","name":"Default"}]}',
  });

  const [{ snapshot }] = masked(recorded);

  assert.equal(
    snapshot.responses[0]?.body,
    '{"version":1,"projects":[{"id":"mcp-search-projects","name":"mcp-search-projects"}]}',
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
