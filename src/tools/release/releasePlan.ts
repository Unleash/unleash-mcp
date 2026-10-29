import type { FlagState } from '../shared/flagState.ts';
import { type EnvironmentState, type Plan, planMilestone, planTargets, planTemplate } from '../shared/rollout/plan.ts';
import type { ReleaseInput } from './releaseInput.ts';

/** Plans a release to whichever audience the release input names: targets, a release template or a milestone. */
export const planAudience = ({
  flag,
  state,
  audience,
  current,
}: {
  flag: string;
  state: FlagState;
  audience: ReleaseInput['audience'];
  current: EnvironmentState;
}): Plan => {
  if ('targets' in audience) return planTargets({ flag, state, targets: audience.targets, current });
  if ('template' in audience) return planTemplate({ template: audience.template, state, current });
  const milestone = { planId: audience.releasePlan, milestoneId: audience.milestone };
  return planMilestone({ milestone, state, current });
};
