import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const LogLevelSchema = z.enum(['silent', 'error', 'info', 'debug']);

const ConfigSchema = z.object({
  baseUrl: z.string().url('UNLEASH_BASE_URL must be a valid URL'),
  pat: z.string().min(1, 'UNLEASH_PAT is required'),
  defaultProject: z.string().min(1).optional(),
  defaultEnvironment: z.string().min(1).optional(),
  dryRun: z.boolean(),
  logLevel: LogLevelSchema
});

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type AppConfig = z.infer<typeof ConfigSchema>;

function parseArgs(argv: string[]) {
  const result: { dryRun?: boolean; logLevel?: LogLevel } = {};

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    if (arg.startsWith('--log-level=')) {
      const value = arg.split('=')[1] as LogLevel;
      if (LogLevelSchema.safeParse(value).success) {
        result.logLevel = value;
      }
      continue;
    }

    if (arg === '--log-level') {
      const next = argv[index + 1];
      if (next && !next.startsWith('--') && LogLevelSchema.safeParse(next).success) {
        result.logLevel = next as LogLevel;
        index += 1;
      }
    }
  }

  return result;
}

export function loadConfig(): AppConfig {
  loadEnv();

  const args = parseArgs(process.argv);

  const environmentOverrides = {
    dryRun: process.env.UNLEASH_DRY_RUN === 'true',
    logLevel: process.env.UNLEASH_LOG_LEVEL
  };

  const parsed = ConfigSchema.safeParse({
    baseUrl: process.env.UNLEASH_BASE_URL,
    pat: process.env.UNLEASH_PAT,
    defaultProject: process.env.UNLEASH_DEFAULT_PROJECT,
    defaultEnvironment: process.env.UNLEASH_DEFAULT_ENVIRONMENT,
    dryRun: args.dryRun ?? environmentOverrides.dryRun ?? false,
    logLevel: args.logLevel ?? environmentOverrides.logLevel ?? 'info'
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }

  return parsed.data;
}
