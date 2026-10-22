import { z } from 'zod';
import { target } from './target.ts';

export const releaseInput = {
  project: z.string().describe('Project id'),
  flag: z.string().describe('Feature flag name. Created when missing'),
  environment: z.string().describe('Environment name, enabled in the project'),
  targets: z.array(target).min(1).describe('The audiences that get the feature, ORed. Replaces what the environment had'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
