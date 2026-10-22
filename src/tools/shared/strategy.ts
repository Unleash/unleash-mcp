import type { Constraint, Target, Value } from './target.ts';

/** The share of a target's audience that gets the feature, 100 when the target leaves it out. */
export const rolloutOf = (target: Target): number => target.rollout ?? 100;

/** Turns an agent-facing target into the Unleash strategy that serves it. `groupId` keys the rollout's stickiness. */
export const toStrategy = (groupId: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId },
  constraints: (target.constraints ?? []).map(toConstraint),
  segments: target.segments ?? [],
  variants: (target.values ?? []).map(toVariant),
});

/** The Unleash strategy a target becomes. */
export type Strategy = ReturnType<typeof toStrategy>;

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
