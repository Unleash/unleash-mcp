import * as dotenv from 'dotenv';
import { z } from 'zod';
import type { FeedbackConsentDecision } from './feedback/consentDecision.js';
import { parseAttributionEnv } from './unleash/attribution.js';

// Load environment variables from .env file
// quiet: true — dotenv's default tip log writes to stdout, which corrupts the MCP stdio JSON-RPC stream
dotenv.config({ quiet: true });

export const DEFAULT_FEEDBACK_BASE_URL = 'https://sandbox.getunleash.io/enterprise';

const feedbackBaseUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .url({
      protocol: /^https?$/,
      error:
        'UNLEASH_FEEDBACK_URL must be an absolute http(s) instance base URL such as https://host/hosted',
    })
    .transform((url) => url.replace(/\/+$/, ''))
    .default(DEFAULT_FEEDBACK_BASE_URL),
);

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
    feedbackUrl: feedbackBaseUrlSchema,
    feedbackConsent: z.enum(['granted', 'denied']).optional(),
  }),
  server: z.object({
    dryRun: z.boolean().default(false),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('error'),
    attributionEnabled: z.boolean().default(true),
    configDir: z.string().optional(),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function parseFeedbackConsentEnv(
  value: string | undefined,
): FeedbackConsentDecision | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') return 'granted';
  if (normalized === 'false') return 'denied';
  return undefined;
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Parse CLI arguments for --dry-run and --log-level flags.
 * Log level is optional here because LOG_LEVEL env is the primary source.
 */
function parseCliFlags(): { dryRun: boolean; logLevel?: string } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let logLevel: string | undefined;

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
  const logLevel = cliFlags.logLevel ?? process.env.LOG_LEVEL;

  const rawConfig = {
    unleash: {
      baseUrl: process.env.UNLEASH_BASE_URL,
      pat: process.env.UNLEASH_PAT,
      defaultProject: process.env.UNLEASH_DEFAULT_PROJECT,
      defaultEnvironment: process.env.UNLEASH_DEFAULT_ENVIRONMENT,
      feedbackUrl: process.env.UNLEASH_FEEDBACK_URL,
      feedbackConsent: parseFeedbackConsentEnv(process.env.UNLEASH_MCP_SEND_FEEDBACK),
    },
    server: {
      dryRun: cliFlags.dryRun,
      logLevel,
      attributionEnabled: parseAttributionEnv(process.env.UNLEASH_MCP_CLIENT_ATTRIBUTION),
      configDir: trimmedOrUndefined(process.env.UNLEASH_MCP_CONFIG_DIR),
    },
  };

  try {
    const parsed = configSchema.parse(rawConfig);

    return {
      ...parsed,
      unleash: {
        ...parsed.unleash,
        baseUrl: normalizeBaseUrl(parsed.unleash.baseUrl),
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((err) => `  - ${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Configuration validation failed:\n${messages.join('\n')}\n\nPlease check your .env file or environment variables.`,
      );
    }
    throw error;
  }
}

/**
 * Matches a trailing `/api` segment (with optional trailing slash) at the very
 * end of a URL pathname. Only the complete `api` segment matches — paths like
 * `/api-v2` or `/api/admin` are left alone.
 */
const TRAILING_API_SEGMENT = /\/api\/?$/;

/**
 * Returns true if the given URL string ends with a `/api` (or `/api/`) segment.
 * Useful for surfacing a one-time info message when the configured URL was
 * normalized by stripping the trailing `/api`.
 */
export function hasTrailingApiSegment(url: string): boolean {
  return TRAILING_API_SEGMENT.test(url);
}

export function resolveFeedbackBaseUrl(raw?: string): string {
  const parsed = feedbackBaseUrlSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${parsed.error.issues[0]?.message} (received "${raw}")`);
  }

  return parsed.data;
}

export function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Collapse multiple slashes in the path, then strip trailing slashes.
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    // Strip a trailing `/api` segment if present. Most Unleash SDKs require
    // `/api` in the base URL (they hit `/api/client/...` endpoints under it),
    // but the MCP server hits `/api/admin/...` and adds the `/api` prefix
    // itself. Accepting both forms avoids the "doubled /api" footgun that
    // happens when users copy a base URL from their SDK configuration.
    parsed.pathname = parsed.pathname.replace(TRAILING_API_SEGMENT, '') || '/';
    return parsed.toString();
  } catch {
    // Fallback for non-URL inputs: same normalizations, regex-only.
    return url.replace(/\/+$/, '').replace(TRAILING_API_SEGMENT, '');
  }
}
