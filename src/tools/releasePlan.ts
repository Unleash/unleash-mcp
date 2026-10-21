import type { Constraint, Target } from './releaseInput.ts';

export type EnvironmentPath = { projectId: string; featureName: string; environment: string };

type Strategy = ReturnType<typeof toStrategy>;

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

export const rolloutOf = (target: Target): number => target.rollout ?? 100;

const toStrategy = (flag: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId: flag },
  constraints: (target.constraints ?? []).map(toConstraint),
  segments: target.segments ?? [],
  // Unleash rejects a lone variant with a fixed weight, so it takes all of the variable weight.
  variants: target.value ? [{ ...target.value, weight: 1000, weightType: 'variable' as const, stickiness: 'default' }] : [],
});

const toConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});
