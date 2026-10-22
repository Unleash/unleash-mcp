import type { Target } from '../shared/target.ts';
import { type Strategy, toStrategy } from '../shared/strategy.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

export type Plan = { updates: { id: string; strategy: Strategy }[]; adds: Strategy[]; deletes: string[]; enable: boolean };

// Existing strategies are reused by position so their history survives.
export const planRelease = (flag: string, targets: Target[], current: { enabled: boolean; strategyIds: string[] }): Plan => {
  const plan: Plan = { updates: [], adds: [], deletes: current.strategyIds.slice(targets.length), enable: !current.enabled };
  for (const [i, target] of targets.entries()) {
    const id = current.strategyIds[i];
    const strategy = toStrategy(flag, target);
    if (id) plan.updates.push({ id, strategy });
    else plan.adds.push(strategy);
  }
  return plan;
};
