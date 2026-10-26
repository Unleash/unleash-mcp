import type { Target } from '../shared/target.ts';
import { type Strategy, toStrategy } from '../shared/strategy.ts';
import type { FlagState } from './releaseInput.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

/**
 * The writes that take an environment to a release's end state. `toggle` is set only when the state changes.
 * `template` is the release template to apply, when the release goes through one.
 */
export type Plan = { updates: { id: string; strategy: Strategy }[]; adds: Strategy[]; deletes: string[]; toggle?: FlagState; template?: string };

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
