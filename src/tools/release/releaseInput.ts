import { z } from 'zod';
import { target } from '../shared/target.ts';

export const flagState = z.enum(['on', 'off']);

/** Whether a flag's environment serves the feature to its targets. */
export type FlagState = z.infer<typeof flagState>;

const flag = z.object({
  name: z.string().describe('Feature flag name, as a flags search returns it. Created when missing and state is on'),
  state: flagState.describe('Whether the environment serves the feature to the targets'),
});

/** The release tool's input: the end state of a flag in one environment. */
export const releaseInput = {
  project: z.string().describe('Project id, as a projects search returns it'),
  flag,
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  targets: z.array(target).min(1).describe('The audiences that get the feature while it is on, ORed. Replaces what the environment had'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
