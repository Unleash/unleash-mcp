import type { Target } from '../shared/target.ts';
import { type Strategy, toStrategy } from '../shared/strategy.ts';
import type { FlagState } from './releaseInput.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

/** The writes that take an environment to a release's end state. `toggle` is set only when the state changes. */
export type Plan = { updates: { id: string; strategy: Strategy }[]; adds: Strategy[]; deletes: string[]; toggle?: FlagState };

// Existing strategies are reused by position so their history survives.
export const planRelease = (flag: string, state: FlagState, targets: Target[], current: { enabled: boolean; strategyIds: string[] }): Plan => {
  const plan: Plan = { updates: [], adds: [], deletes: current.strategyIds.slice(targets.length) };
  if ((state === 'on') !== current.enabled) plan.toggle = state;
  for (const [i, target] of targets.entries()) {
    const id = current.strategyIds[i];
    const strategy = toStrategy(flag, target);
    if (id) plan.updates.push({ id, strategy });
    else plan.adds.push(strategy);
  }
  return plan;
};
