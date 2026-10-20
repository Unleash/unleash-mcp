import { z } from 'zod';

export const releaseInput = {
  project: z.string().describe('Project id'),
  flag: z.string().describe('Feature flag name'),
  environment: z.string().describe('Environment name'),
  rollout: z.number().int().min(0).max(100).describe('Percentage of users that get the feature'),
  createFlag: z.boolean().optional().describe('Set to true once the user has confirmed creating the missing flag'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
