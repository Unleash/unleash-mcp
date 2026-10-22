import type { Constraint, Target, Value } from '../shared/target.ts';

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
  variants: (target.values ?? []).map(toVariant),
});

const toVariant = ({ share, ...value }: Value, i: number, all: Value[]) => {
  const fixed = share !== undefined && (i < all.length - 1 || all.some((v) => v.share === undefined));
  return { ...value, weight: (share ?? 0) * 10, weightType: fixed ? ('fix' as const) : ('variable' as const), stickiness: 'default' };
};

const toConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});
