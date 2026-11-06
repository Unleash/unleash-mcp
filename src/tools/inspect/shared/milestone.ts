import type { components } from '../../../unleash/api.d.ts';
import { toConstraint, type UnleashConstraint } from '../../shared/constraint.ts';
import type { Target, Value } from '../../shared/target.ts';
import type { Transition } from '../inspectOutput.ts';

type UnleashVariant = components['schemas']['strategyVariantSchema'];

// What a feature strategy and a release plan or template milestone strategy have in common.
type UnleashStrategy = {
  name: string;
  title?: string | null;
  parameters?: Record<string, string>;
  constraints?: UnleashConstraint[];
  segments?: number[];
  variants?: UnleashVariant[];
};

// TODO: take `transitionConditionSchema` directly once the spec uses it on a plan milestone instead of an empty object.
/** Maps a milestone's transition condition to how the plan moves on from it by itself. */
export const toTransition = (condition: object): Transition => {
  const c = condition as components['schemas']['transitionConditionSchema'];
  return c.type === 'exposure'
    ? { type: 'exposure', minimumExposures: c.minimumExposures }
    : { type: 'time', intervalMinutes: c.intervalMinutes };
};

/** Maps a strategy to a target in the shape release takes, the reverse of `toStrategy`, so a target can be edited and released again. */
export const toTarget =
  (flag: string) =>
  (s: UnleashStrategy): Target & { rollout: number; stickiness: string; rolloutGroup: string } => ({
    name: s.title || s.name,
    rollout: Number(s.parameters?.rollout ?? 100),
    stickiness: s.parameters?.stickiness ?? 'default',
    rolloutGroup: s.parameters?.groupId ?? flag,
    ...(s.constraints?.length ? { constraints: s.constraints.map(toConstraint) } : {}),
    ...(s.segments?.length ? { segments: s.segments } : {}),
    ...(s.variants?.length ? { values: s.variants.map(toValue) } : {}),
  });

// A variable weight is what Unleash resolved, not what was asked for, so only a fixed one comes back as a share.
const toValue = ({ name, payload, weight, weightType }: UnleashVariant): Value => ({
  name,
  ...(payload ? { payload: { type: payload.type, value: payload.value } } : {}),
  ...(weightType === 'fix' ? { share: weight / 10 } : {}),
});
