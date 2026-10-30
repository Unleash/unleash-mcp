import { type Dispatcher, type Interceptable, MockAgent, SnapshotAgent } from 'undici';
import { z } from 'zod';
import { readConfig } from '../config.ts';
import { createUnleashClient, type UnleashClient } from './client.ts';
import { decodeBodies, encodedCopyOf } from './testSnapshot.ts';

// Tests replay recorded exchanges so they stay subsecond and work offline; recording against the real
// Unleash is the only way to keep the snapshots truthful about the API.
// `admin` is for setup and teardown, which an admin would do in the real world; `unleash` keeps the user's permissions.
export const createRecordedClient = (
  snapshotPath: string,
): { unleash: UnleashClient; admin: UnleashClient; close: () => Promise<void> } => {
  const config = readConfig(process.env);
  const record = config.UNLEASH_SNAPSHOT_MODE === 'record';
  const encoded = record ? undefined : encodedCopyOf(snapshotPath);
  const agent = new SnapshotAgent({
    mode: config.UNLEASH_SNAPSHOT_MODE,
    snapshotPath: encoded?.path ?? snapshotPath,
    excludeHeaders: ['authorization', ...churningHeaders],
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
  // Closing the agent writes the snapshots when recording.
  const close = async (): Promise<void> => {
    await agent.close();
    if (record) decodeBodies(snapshotPath);
    encoded?.remove();
  };
  return { unleash, admin, close };
};

// Response headers that change on every recording and that nothing reads: left out so re-recording only diffs what matters.
const churningHeaders = [
  'date',
  'etag',
  'ratelimit-limit',
  'ratelimit-policy',
  'ratelimit-remaining',
  'ratelimit-reset',
];

// Replays ignore the authorization header, so only recording needs the admin token.
const adminHeaders = (record: boolean): Record<string, string> =>
  record
    ? { Authorization: z.object({ UNLEASH_ADMIN_PAT: z.string().min(1) }).parse(process.env).UNLEASH_ADMIN_PAT }
    : {};

// Error cases are not recorded: tests declare on `stub` what Unleash would reply. Never reaches the network.
export const createStubbedClient = (): { unleash: UnleashClient; stub: Interceptable } => {
  const { baseUrl, fetch, stub } = createStubbedFetch();
  return { unleash: createUnleashClient({ baseUrl, headers: {}, fetch }), stub };
};

// For code that builds its own Unleash client from a fetch, such as the remote handler.
export const createStubbedFetch = (): { baseUrl: string; fetch: typeof globalThis.fetch; stub: Interceptable } => {
  const baseUrl = 'https://unleash.example';
  const agent = new MockAgent();
  agent.disableNetConnect();
  return { baseUrl, fetch: createFetch(agent), stub: agent.get(baseUrl) };
};

// Uncompressed answers keep the recorded bodies readable; the header is part of undici's request hash, so it is always sent.
const createFetch =
  (agent: Dispatcher): typeof fetch =>
  (input, init) => {
    const request = new Request(input, init);
    request.headers.set('accept-encoding', 'identity');
    return globalThis.fetch(request, { dispatcher: agent });
  };
