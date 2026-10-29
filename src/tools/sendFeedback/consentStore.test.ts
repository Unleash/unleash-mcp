import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixedClock } from '../../testClock.ts';
import { createConsentStore, platformConfigDir } from './consentStore.ts';

const now = fixedClock('2026-10-27T10:00:00.000Z');

// A fresh directory per test, removed once the test is done.
const tempDir = async (t: { after: (fn: () => Promise<void>) => void }): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'unleash-mcp-consent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

test('remembers the decision for the next session', async (t) => {
  const location = join(await tempDir(t), 'unleash-mcp', 'feedback_consent.json');

  await createConsentStore(location, now).write('granted');

  assert.equal(await createConsentStore(location, now).read(), 'granted');
  assert.deepEqual(JSON.parse(await readFile(location, 'utf8')), {
    consent: 'granted',
    decidedAt: '2026-10-27T10:00:00.000Z',
    consentVersion: 1,
  });
});

test('has no decision before the user is asked', async (t) => {
  const store = createConsentStore(join(await tempDir(t), 'feedback_consent.json'), now);

  assert.equal(await store.read(), undefined);
});

test('has no decision when the file holds something else', async (t) => {
  const location = join(await tempDir(t), 'feedback_consent.json');
  const store = createConsentStore(location, now);

  for (const contents of [
    'not json',
    JSON.stringify({ consent: 'granted', decidedAt: '2026-10-27T10:00:00.000Z', consentVersion: 2 }),
  ]) {
    await writeFile(location, contents);
    assert.equal(await store.read(), undefined);
  }
});

test('keeps no decision, without failing, when the directory cannot be created', async (t) => {
  const blocker = join(await tempDir(t), 'a-file');
  await writeFile(blocker, '');
  const store = createConsentStore(join(blocker, 'feedback_consent.json'), now);

  await store.write('granted');

  assert.equal(await store.read(), undefined);
});

test('keeps its files in the platform config directory', () => {
  assert.equal(
    platformConfigDir({}, 'darwin', '/home/u'),
    join('/home/u', 'Library', 'Application Support', 'unleash-mcp'),
  );
  assert.equal(platformConfigDir({}, 'linux', '/home/u'), join('/home/u', '.config', 'unleash-mcp'));
  assert.equal(platformConfigDir({ APPDATA: '/appdata' }, 'win32', '/home/u'), join('/appdata', 'unleash-mcp'));
  assert.equal(platformConfigDir({}, 'win32', '/home/u'), join('/home/u', 'AppData', 'Roaming', 'unleash-mcp'));
});

test('keeps its files under XDG_CONFIG_HOME on any platform that sets it', () => {
  assert.equal(platformConfigDir({ XDG_CONFIG_HOME: '/xdg' }, 'darwin', '/home/u'), join('/xdg', 'unleash-mcp'));
});
