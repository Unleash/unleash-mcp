import { type Dispatcher, type Interceptable, MockAgent, SnapshotAgent } from 'undici';
import { z } from 'zod';
import { readConfig } from '../config.ts';
import { createUnleashClient, type UnleashClient } from './client.ts';

// Tests replay recorded exchanges so they stay subsecond and work offline; recording against the real
// Unleash is the only way to keep the snapshots truthful about the API.
// `admin` is for setup and teardown, which an admin would do in the real world; `unleash` keeps the user's permissions.
export const createRecordedClient = (snapshotPath: string): { unleash: UnleashClient; admin: UnleashClient; close: () => Promise<void> } => {
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
  const admin = createUnleashClient({
    baseUrl: config.UNLEASH_BASE_URL,
    headers: adminHeaders(record),
    fetch: createFetch(agent),
  });
  const close = async (): Promise<void> => {
    if (record) await agent.saveSnapshots();
    await agent.close();
  };
  return { unleash, admin, close };
};

// Replays ignore the authorization header, so only recording needs the admin token.
const adminHeaders = (record: boolean): Record<string, string> =>
  record ? { Authorization: z.object({ UNLEASH_ADMIN_PAT: z.string().min(1) }).parse(process.env).UNLEASH_ADMIN_PAT } : {};

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
