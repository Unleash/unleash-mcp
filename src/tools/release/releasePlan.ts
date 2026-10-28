import type { FlagState } from '../shared/flagState.ts';
import { type Current, type Plan, planMilestone, planTargets, planTemplate } from '../shared/rollout/plan.ts';
import type { ReleaseInput } from './releaseInput.ts';

/** Plans a release to whichever audience the release input names: targets, a release template or a milestone. */
export const planAudience = (flag: string, state: FlagState, audience: ReleaseInput['audience'], current: Current): Plan => {
  if ('targets' in audience) return planTargets(flag, state, audience.targets, current);
  if ('template' in audience) return planTemplate(audience.template, state, current);
  return planMilestone({ planId: audience.releasePlan, milestoneId: audience.milestone }, state, current);
};
