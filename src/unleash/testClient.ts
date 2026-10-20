import { type Dispatcher, type Interceptable, MockAgent, SnapshotAgent } from 'undici';
import { readConfig } from '../config.ts';
import { createUnleashClient, type UnleashClient } from './client.ts';

// Tests replay recorded exchanges so they stay subsecond and work offline; recording against the real
// Unleash is the only way to keep the snapshots truthful about the API.
export const createRecordedClient = (snapshotPath: string): { unleash: UnleashClient; close: () => Promise<void> } => {
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
    fetch: createFetch(agent),
  });
  const close = async (): Promise<void> => {
    if (record) await agent.saveSnapshots();
    await agent.close();
  };
  return { unleash, close };
};

// Error cases are not recorded: tests declare on `stub` what Unleash would reply. Never reaches the network.
export const createStubbedClient = (): { unleash: UnleashClient; stub: Interceptable } => {
  const baseUrl = 'https://unleash.example';
  const agent = new MockAgent();
  agent.disableNetConnect();
  const unleash = createUnleashClient({ baseUrl, headers: {}, fetch: createFetch(agent) });
  return { unleash, stub: agent.get(baseUrl) };
};

const createFetch =
  (agent: Dispatcher): typeof fetch =>
  (input, init) =>
    globalThis.fetch(input, { ...init, dispatcher: agent });
