import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createSnapshotClient } from '../unleash/snapshotClient.ts';
import { createRelease } from './release.ts';

const { unleash, close } = createSnapshotClient(new URL('./release.snapshot.json', import.meta.url).pathname);
const project = 'mcp-server';
const flag = 'mcp-flag';

const recreateFlag = async (): Promise<void> => {
  await unleash.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  await unleash.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName: flag } } });
  const { error } = await unleash.POST('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
    body: { name: flag },
  });
  if (error) throw new Error('create flag failed');
};

before(recreateFlag);
after(close);

test('releases a flag to a percentage of users', async () => {
  const release = createRelease(unleash);

  const output = await release({ project, flag, environment: 'development', rollout: 50 });

  assert.deepEqual(output, { kind: 'released', flag, environment: 'development', rollout: 50 });
});
