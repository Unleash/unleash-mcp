import type { Constraint, Target, Value } from './target.ts';

/** The share of a target's audience that gets the feature, 100 when the target leaves it out. */
export const rolloutOf = (target: Target): number => target.rollout ?? 100;

/** What keeps a user in the target's rollout and in their value, Unleash's `default` when the target leaves it out. */
export const stickinessOf = (target: Target): string => target.stickiness ?? 'default';

/** A target as the tools report it back: with the rollout and stickiness it was written with. */
export const withDefaults = <T extends Target>(target: T) => ({
  ...target,
  rollout: rolloutOf(target),
  stickiness: stickinessOf(target),
});

/**
 * Turns an agent-facing target into the Unleash strategy that serves it. `groupId` keys the rollout's stickiness.
 * Unleash requires the stickiness on each variant too, so they get the target's.
 */
export const toStrategy = (groupId: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: stickinessOf(target), groupId },
  constraints: (target.constraints ?? []).map(toUnleashConstraint),
  segments: target.segments ?? [],
  variants: toVariants(target.values ?? [], stickinessOf(target)),
});

/** The Unleash strategy a target becomes. */
export type Strategy = ReturnType<typeof toStrategy>;

const toVariants = (values: Value[], stickiness: string) =>
  values.map(({ share, ...value }, i) => {
    const fixed = share !== undefined && (i < values.length - 1 || values.some((v) => v.share === undefined));
    return {
      ...value,
      weight: (share ?? 0) * 10,
      weightType: fixed ? ('fix' as const) : ('variable' as const),
      stickiness,
    };
  });

/** Turns an agent-facing constraint into the shape Unleash stores on strategies and segments. */
export const toUnleashConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});
