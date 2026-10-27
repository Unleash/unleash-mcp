import { z } from 'zod';

// An env file line such as `UNLEASH_FEEDBACK_URL=` sets an empty string, which means unset.
const blankAsUnset = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const configSchema = z.object({
  UNLEASH_BASE_URL: z.url(),
  UNLEASH_PAT: z.string().min(1),
  UNLEASH_SNAPSHOT_MODE: z.enum(['record', 'playback']).default('playback'),
  // The user's consent to sending anonymous feedback to Unleash. Unset, the user is asked on the first report.
  UNLEASH_MCP_SEND_FEEDBACK: z.preprocess(blankAsUnset, z.stringbool().optional()),
  // Where the user's consent is kept between sessions. Unset, the platform's config directory.
  UNLEASH_MCP_CONFIG_DIR: z.preprocess(blankAsUnset, z.string().optional()),
  // The Unleash instance that receives feedback. No default: without it, send_feedback fails.
  UNLEASH_FEEDBACK_URL: z.preprocess(blankAsUnset, z.url({ protocol: /^https?$/ }).optional()),
});

export type Config = z.infer<typeof configSchema>;

export const readConfig = (env: Record<string, string | undefined>): Config => configSchema.parse(env);
