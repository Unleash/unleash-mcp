import { z } from 'zod';
import { flagState } from '../shared/flagState.ts';
import { target } from '../shared/target.ts';

const flag = z.object({
  name: z.string().describe('Feature flag name, as a flags search returns it. Created when missing and state is on'),
  state: flagState.describe('Whether the environment serves the feature to the targets'),
});

// The audience replaces what the environment had, so a key dropped in silence would release something other than
// what the agent asked for and still report success.
const targets = z.object({
  targets: z.array(target).min(1).describe('The audiences that get the feature while it is on, ORed'),
}).strict();

const template = z.object({
  template: z.string().describe('Release template id, as a release templates search returns it. Its first milestone starts right away, replacing any release plan the flag had'),
}).strict();

const milestone = z.object({
  releasePlan: z.string().describe('Release plan id, as inspecting the flag shows it'),
  milestone: z.string().describe('Id of the milestone to start, as inspecting the flag shows it. Replaces the milestone being served'),
}).strict();

/** The release tool's input: the end state of a flag in one environment, reached through targets, a release template or a milestone of its release plan. */
export const releaseInput = {
  project: z.string().describe('Project id, as a projects search returns it'),
  flag,
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  // Release accepts exactly one of targets, a release template or a milestone. xor is not supported on top-level properties,
  // so 'audience' wraps the mutually exclusive options.
  audience: z.xor([targets, template, milestone]).describe('Who gets the feature while it is on: targets, a release template, or a milestone of the release plan the flag has. Replaces what the environment had'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
