import { z } from 'zod';
import { target } from '../shared/target.ts';

export const releaseInput = {
  project: z.string().describe('Project id, as a projects search returns it'),
  flag: z.string().describe('Feature flag name, as a flags search returns it. Created when missing'),
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  targets: z.array(target).min(1).describe('The audiences that get the feature, ORed. Replaces what the environment had'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
