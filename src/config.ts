import { z } from 'zod';

const schema = z.object({
  UNLEASH_BASE_URL: z.url(),
  UNLEASH_PAT: z.string().min(1),
});

export type Config = z.infer<typeof schema>;

export const readConfig = (env: Record<string, string | undefined>): Config => schema.parse(env);
