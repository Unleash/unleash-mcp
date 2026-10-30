import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The checked-in snapshot holds response bodies as text, so it reads and diffs as the JSON Unleash sent (the recording client
// asks for no compression to make that so); the file undici reads and writes holds them as base64.

/** Rewrites a snapshot undici just recorded into the checked-in form. */
export const decodeBodies = (snapshotPath: string): void =>
  writeEntries(snapshotPath, transcoded(readEntries(snapshotPath), 'base64', 'utf8'));

/** The checked-in snapshot with its bodies encoded back for undici to replay, in a file of its own that `remove` deletes. */
export const encodedCopyOf = (snapshotPath: string): { path: string; remove: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'unleash-mcp-snapshot-'));
  const path = join(dir, 'snapshot.json');
  writeEntries(path, transcoded(readEntries(snapshotPath), 'utf8', 'base64'));
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) };
};

type RecordedResponse = { body: string; [key: string]: unknown };
type Snapshot = { timestamp?: string; responses: RecordedResponse[]; [key: string]: unknown };
type Entry = { hash: string; snapshot: Snapshot };

/**
 * The entries with every response body re-encoded, and without undici's recording timestamp: undici stamps every exchange
 * with when it was recorded and nothing reads it back, so leaving it out keeps a re-recording's diff to what matters.
 */
export const transcoded = (entries: Entry[], from: BufferEncoding, to: BufferEncoding): Entry[] =>
  entries.map(({ hash, snapshot: { timestamp: _, ...snapshot } }) => ({
    hash,
    snapshot: {
      ...snapshot,
      responses: snapshot.responses.map((r) => ({ ...r, body: Buffer.from(r.body, from).toString(to) })),
    },
  }));

const readEntries = (path: string): Entry[] => JSON.parse(readFileSync(path, 'utf8'));
const writeEntries = (path: string, entries: Entry[]): void => writeFileSync(path, JSON.stringify(entries, null, 2));
