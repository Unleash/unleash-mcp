import { z } from 'zod';

export const releaseOutput = {
  kind: z.literal('released'),
  flag: z.string(),
  environment: z.string(),
  rollout: z.number(),
};

export type ReleaseOutput = z.infer<z.ZodObject<typeof releaseOutput>>;
