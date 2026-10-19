import { z } from 'zod';

export const releaseInput = {
  project: z.string().describe('Project id'),
  flag: z.string().describe('Feature flag name'),
  environment: z.string().describe('Environment name'),
  rollout: z.number().int().min(0).max(100).describe('Percentage of users that get the feature'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
