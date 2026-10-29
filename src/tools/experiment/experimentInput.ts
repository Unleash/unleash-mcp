import { z } from 'zod';
import { flagState } from '../shared/flagState.ts';
import { target } from '../shared/target.ts';

const flag = z.strictObject({
  name: z
    .string()
    .describe(
      'Feature flag name, as a flags search returns it. Created as an experiment when missing, in either state. An existing flag keeps its type; manage_flag changes it',
    ),
  state: flagState.describe('enabled: each audience is split across its values; disabled: nobody gets the feature'),
});

// Each audience names the values it gets; audiences may serve one value each, as control and treatment groups do.
const experimentTarget = target.required({ values: true });

export const experimentInput = z.strictObject({
  project: z.string().describe('Project id, as a projects search returns it'),
  flag,
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  targets: z
    .array(experimentTarget)
    .min(1)
    .describe(
      'The audiences in the experiment, ORed, each with the values it gets, such as control and treatment: split within one audience by share, or one value per audience. Replaces what the environment had. Changing shares or stickiness mid-run moves users between values',
    ),
  impressionData: z
    .boolean()
    .optional()
    .describe(
      'Whether SDKs report each evaluation, so analytics can attribute results to values. On when the flag is created unless false; an existing flag keeps its setting',
    ),
});

export type ExperimentInput = z.infer<typeof experimentInput>;
