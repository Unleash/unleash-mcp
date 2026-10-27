import type { FlagState } from '../shared/flagState.ts';
import { type Strategy, toStrategy } from '../shared/strategy.ts';
import type { Target } from '../shared/target.ts';
import type { ReleaseInput } from './releaseInput.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

/** A milestone of a release plan, by the ids inspect shows. */
export type MilestoneRef = { planId: string; milestoneId: string };

/**
 * The writes that take an environment to a release's end state. `toggle` is set only when the state changes.
 * `template` is the release template to apply, and `milestone` the release plan milestone to start, when the release goes through one.
 */
export type Plan = { updates: { id: string; strategy: Strategy }[]; adds: Strategy[]; deletes: string[]; toggle?: FlagState; template?: string; milestone?: MilestoneRef };

type Current = { enabled: boolean; strategyIds: string[] };

const toggleOf = (state: FlagState, current: Current): Pick<Plan, 'toggle'> => ((state === 'on') !== current.enabled ? { toggle: state } : {});

// Existing strategies are reused by position so their history survives.
export const planRelease = (flag: string, state: FlagState, targets: Target[], current: Current): Plan => {
  const plan: Plan = { updates: [], adds: [], deletes: current.strategyIds.slice(targets.length), ...toggleOf(state, current) };
  for (const [i, target] of targets.entries()) {
    const id = current.strategyIds[i];
    const strategy = toStrategy(flag, target);
    if (id) plan.updates.push({ id, strategy });
    else plan.adds.push(strategy);
  }
  return plan;
};

/** Plans a release through a release template. The template's plan brings its own strategies, so the environment's own ones all go. */
export const planTemplate = (template: string, state: FlagState, current: Current): Plan =>
  ({ updates: [], adds: [], deletes: current.strategyIds, template, ...toggleOf(state, current) });

/** Plans a release through a milestone of the environment's release plan. The plan brings its own strategies, so the environment's own ones all go. */
export const planMilestone = (milestone: MilestoneRef, state: FlagState, current: Current): Plan =>
  ({ updates: [], adds: [], deletes: current.strategyIds, milestone, ...toggleOf(state, current) });

/** Plans a release to whichever audience the release input names: targets, a release template or a milestone. */
export const planAudience = (flag: string, state: FlagState, audience: ReleaseInput['audience'], current: Current): Plan => {
  if ('targets' in audience) return planRelease(flag, state, audience.targets, current);
  if ('template' in audience) return planTemplate(audience.template, state, current);
  return planMilestone({ planId: audience.releasePlan, milestoneId: audience.milestone }, state, current);
};
