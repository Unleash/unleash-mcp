import { z } from 'zod';
import { flagState } from '../shared/flagState.ts';
import { target } from '../shared/target.ts';

const flag = z.strictObject({
  name: z
    .string()
    .describe(
      'Kill switch name, as a flags search returns it, or a new one, created as a permanent kill switch. Name it after what it turns off, e.g. disable-payments. An existing flag keeps its type; manage_flag changes it',
    ),
  state: flagState.describe(
    'enabled: the app turns off what the switch is named after, e.g. payments for disable-payments; disabled: the app works as usual',
  ),
});

export const killSwitchInput = z.strictObject({
  project: z.string().describe('Project id, as a projects search returns it'),
  flag,
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  targets: z.array(target).min(1).optional().describe('Who the switch is on for, ORed; everyone when left out'),
});

export type KillSwitchInput = z.infer<typeof killSwitchInput>;
