import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { describeError } from '../utils/errors.js';
import type { FeedbackConsentDecision } from './consentDecision.js';

export const CONSENT_VERSION = 1;
export const CONSENT_FILE_NAME = 'feedback_consent.json';

const consentRecordSchema = z.object({
  consent: z.enum(['granted', 'denied']),
  decidedAt: z.string(),
  consentVersion: z.literal(CONSENT_VERSION),
});

export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export type ConsentStoreFailure = { ok: false; error: string };
export type ConsentReadResult = { ok: true; record: ConsentRecord | null } | ConsentStoreFailure;
export type ConsentWriteResult = { ok: true } | ConsentStoreFailure;

export interface ConsentStore {
  readonly location: string;
  read(): ConsentReadResult;
  write(consent: FeedbackConsentDecision): ConsentWriteResult;
}

export function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const home = os.homedir();
  let configDir: string;
  if (env.XDG_CONFIG_HOME?.trim()) {
    configDir = path.resolve(env.XDG_CONFIG_HOME);
  } else if (platform === 'darwin') {
    configDir = path.join(home, 'Library', 'Application Support');
  } else if (platform === 'win32') {
    configDir = env.APPDATA?.trim()
      ? path.resolve(env.APPDATA)
      : path.join(home, 'AppData', 'Roaming');
  } else {
    configDir = path.join(home, '.config');
  }
  return path.join(configDir, 'unleash-mcp');
}

export class FileConsentStore implements ConsentStore {
  readonly location: string;

  constructor(location: string) {
    this.location = location;
  }

  read(): ConsentReadResult {
    let raw: string;
    try {
      raw = fs.readFileSync(this.location, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: true, record: null };
      }
      return {
        ok: false,
        error: `Could not read consent file ${this.location}: ${describeError(error)}`,
      };
    }

    const parsed = consentRecordSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      return { ok: false, error: `Consent file ${this.location} has unexpected contents` };
    }
    return { ok: true, record: parsed.data };
  }

  write(consent: FeedbackConsentDecision): ConsentWriteResult {
    const record: ConsentRecord = {
      consent,
      decidedAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
    };
    const tempPath = `${this.location}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.location), { recursive: true });
      fs.writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tempPath, this.location);
      return { ok: true };
    } catch (error) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {}
      return {
        ok: false,
        error: `Could not save feedback consent to ${this.location}: ${describeError(error)}. Make sure the directory exists and is writable.`,
      };
    }
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
