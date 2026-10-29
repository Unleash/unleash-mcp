import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { Clock } from '../../clock.ts';

/** The user's answer to whether reports may be sent to Unleash. */
export type Decision = 'granted' | 'denied';

/** Keeps the user's decision between sessions, so the user is asked once. */
export type ConsentStore = {
  /** Where the decision is kept, to show the user. */
  location: string;
  /** The stored decision, or none when there is no file or it can't be read. */
  read: () => Promise<Decision | undefined>;
  /** Stores the decision. Never fails: when it can't be stored, the user is asked again next session. */
  write: (decision: Decision) => Promise<void>;
};

// Same file as v1, so a decision taken with v1 still holds.
const consentFile = z.object({
  consent: z.enum(['granted', 'denied']),
  decidedAt: z.string(),
  consentVersion: z.literal(1),
});

/** Creates a store over the file at `location`, dating each decision with `now`. */
export const createConsentStore = (location: string, now: Clock): ConsentStore => ({
  location,
  read: async () => {
    const contents = await readFile(location, 'utf8').catch(() => undefined);
    return consentFile.safeParse(parseJson(contents)).data?.consent;
  },
  write: async (decision) => {
    const record: z.infer<typeof consentFile> = {
      consent: decision,
      decidedAt: now().toISOString(),
      consentVersion: 1,
    };
    // Written aside then renamed, so a crash never leaves a half-written file.
    const temporary = `${location}.${process.pid}.tmp`;
    try {
      await mkdir(dirname(location), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, location);
    } catch {
      await rm(temporary, { force: true }).catch(() => {});
    }
  },
});

const parseJson = (contents: string | undefined): unknown => {
  try {
    return contents === undefined ? undefined : JSON.parse(contents);
  } catch {
    return undefined;
  }
};

/** Where this server keeps its files when the user doesn't pick a directory: the platform's config directory, as v1 did. */
export const platformConfigDir = (
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  home: string,
): string => {
  const base = env.XDG_CONFIG_HOME?.trim()
    ? resolve(env.XDG_CONFIG_HOME)
    : platform === 'darwin'
      ? join(home, 'Library', 'Application Support')
      : platform === 'win32'
        ? env.APPDATA?.trim()
          ? resolve(env.APPDATA)
          : join(home, 'AppData', 'Roaming')
        : join(home, '.config');
  return join(base, 'unleash-mcp');
};
