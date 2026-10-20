import { SnapshotAgent } from 'undici';
import { readConfig } from '../config.ts';
import { createUnleashClient, type UnleashClient } from './client.ts';

// Tests replay recorded exchanges so they stay subsecond and work offline; recording against the real
// Unleash is the only way to keep the snapshots truthful about the API.
export const createSnapshotClient = (snapshotPath: string): { unleash: UnleashClient; close: () => Promise<void> } => {
  const config = readConfig(process.env);
  const record = config.UNLEASH_SNAPSHOT_MODE === 'record';
  const agent = new SnapshotAgent({
    mode: config.UNLEASH_SNAPSHOT_MODE,
    snapshotPath,
    excludeHeaders: ['authorization'],
    ignoreHeaders: ['authorization'],
  });
  const unleash = createUnleashClient({
    baseUrl: config.UNLEASH_BASE_URL,
    headers: { Authorization: config.UNLEASH_PAT },
    fetch: (input, init) => globalThis.fetch(input, { ...init, dispatcher: agent }),
  });
  const close = async (): Promise<void> => {
    if (record) await agent.saveSnapshots();
    await agent.close();
  };
  return { unleash, close };
};
