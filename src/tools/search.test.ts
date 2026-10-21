import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRecordedClient } from '../unleash/testClient.ts';
import { createSearch } from './search.ts';

const { unleash, close } = createRecordedClient(new URL('./search.snapshot.json', import.meta.url).pathname);

after(close);

test('answers each query in the order asked', async () => {
  const search = createSearch(unleash);

  const output = await search({ queries: [{ kind: 'project', project: 'unknown' }, { kind: 'project', project: 'mcp-server' }] });

  assert.deepEqual(output, {
    results: [
      { kind: 'failed', status: 404, name: 'NotFoundError', reasons: ['No project found'] },
      { kind: 'project', environments: ['development', 'production'] },
    ],
  });
});
