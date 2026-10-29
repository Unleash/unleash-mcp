import type { FlagState } from '../flagState.ts';
import { type Strategy, toStrategy } from '../strategy.ts';
import type { Target } from '../target.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

/** A milestone of a release plan, by the ids inspect shows. */
export type MilestoneRef = { planId: string; milestoneId: string };

/**
 * The writes that take an environment to a release's end state. `toggle` is set only when the state changes.
 * `template` is the release template to apply, and `milestone` the release plan milestone to start, when the release goes through one.
 */
export type Plan = {
  updates: { id: string; strategy: Strategy }[];
  adds: Strategy[];
  deletes: string[];
  toggle?: FlagState;
  template?: string;
  milestone?: MilestoneRef;
};

/** What the flag's environment has: its state and the ids of its strategies, in order. */
export type EnvironmentState = { state: FlagState; strategyIds: string[] };

const toggleOf = (state: FlagState, current: EnvironmentState): Pick<Plan, 'toggle'> =>
  state !== current.state ? { toggle: state } : {};

// Existing strategies are reused by position so their history survives.
export const planTargets = ({
  flag,
  state,
  targets,
  current,
}: {
  flag: string;
  state: FlagState;
  targets: Target[];
  current: EnvironmentState;
}): Plan => {
  const plan: Plan = {
    updates: [],
    adds: [],
    deletes: current.strategyIds.slice(targets.length),
    ...toggleOf(state, current),
  };
  for (const [i, target] of targets.entries()) {
    const id = current.strategyIds[i];
    const strategy = toStrategy(flag, target);
    if (id) plan.updates.push({ id, strategy });
    else plan.adds.push(strategy);
  }
  return plan;
};

/** Plans a release through a release template. The template's plan brings its own strategies, so the environment's own ones all go. */
export const planTemplate = ({
  template,
  state,
  current,
}: {
  template: string;
  state: FlagState;
  current: EnvironmentState;
}): Plan => ({
  updates: [],
  adds: [],
  deletes: current.strategyIds,
  template,
  ...toggleOf(state, current),
});

/** Plans a release through a milestone of the environment's release plan. The plan brings its own strategies, so the environment's own ones all go. */
export const planMilestone = ({
  milestone,
  state,
  current,
}: {
  milestone: MilestoneRef;
  state: FlagState;
  current: EnvironmentState;
}): Plan => ({
  updates: [],
  adds: [],
  deletes: current.strategyIds,
  milestone,
  ...toggleOf(state, current),
});
