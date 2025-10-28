import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration schema with Zod validation.
 * Supports both environment variables and CLI flags.
 */
const configSchema = z.object({
  unleash: z.object({
    baseUrl: z.string().url('UNLEASH_BASE_URL must be a valid URL'),
    pat: z.string().min(1, 'UNLEASH_PAT is required'),
    defaultProject: z.string().optional(),
    defaultEnvironment: z.string().optional(),
  }),
  server: z.object({
    dryRun: z.boolean().default(false),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Parse CLI arguments for --dry-run and --log-level flags.
 */
function parseCliFlags(): { dryRun: boolean; logLevel: string } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let logLevel = 'info';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--log-level' && i + 1 < args.length) {
      logLevel = args[i + 1];
      i++; // Skip the next argument
    }
  }

  return { dryRun, logLevel };
}

/**
 * Load and validate configuration from environment variables and CLI flags.
 * Throws an error if validation fails with helpful error messages.
 */
export function loadConfig(): Config {
  const cliFlags = parseCliFlags();

  const rawConfig = {
    unleash: {
      baseUrl: process.env.UNLEASH_BASE_URL,
      pat: process.env.UNLEASH_PAT,
      defaultProject: process.env.UNLEASH_DEFAULT_PROJECT,
      defaultEnvironment: process.env.UNLEASH_DEFAULT_ENVIRONMENT,
    },
    server: {
      dryRun: cliFlags.dryRun,
      logLevel: cliFlags.logLevel,
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => `  - ${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Configuration validation failed:\n${messages.join('\n')}\n\nPlease check your .env file or environment variables.`
      );
    }
    throw error;
  }
}
