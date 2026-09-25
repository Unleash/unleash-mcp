import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { Logger } from '../context.js';
import { describeError } from '../utils/errors.js';
import type { FeedbackConsentDecision } from './consentDecision.js';

export const CONSENT_VERSION = 1;
export const CONSENT_FILE_NAME = 'consent.json';

const consentRecordSchema = z.object({
  feedback: z.enum(['granted', 'denied']),
  decidedAt: z.string(),
  consentVersion: z.literal(CONSENT_VERSION),
});

export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export interface ConsentStore {
  readonly location: string;
  read(): ConsentRecord | null;
  write(feedback: FeedbackConsentDecision): boolean;
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
  private readonly logger: Logger;

  constructor(logger: Logger, location: string) {
    this.logger = logger;
    this.location = location;
  }

  read(): ConsentRecord | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.location, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not read consent file ${this.location}: ${describeError(error)}`);
      }
      return null;
    }

    const parsed = consentRecordSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      this.logger.warn(`Ignoring consent file ${this.location}: unexpected contents`);
      return null;
    }
    return parsed.data;
  }

  write(feedback: FeedbackConsentDecision): boolean {
    const record: ConsentRecord = {
      feedback,
      decidedAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
    };
    const tempPath = `${this.location}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.location), { recursive: true });
      fs.writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tempPath, this.location);
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not save feedback consent to ${this.location}; remembering it for this session only: ${describeError(error)}`,
      );
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {}
      return false;
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
