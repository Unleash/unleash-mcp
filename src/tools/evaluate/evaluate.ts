import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import type { EvaluateInput, EvaluateQuery } from './evaluateInput.ts';
import type { Conditions, EvaluateOutput, EvaluateResult, EvaluatedTarget, ServedValue } from './evaluateOutput.ts';
import { toConstraint } from '../shared/constraint.ts';
import { toFailed } from '../shared/failed.ts';

type UnleashVariant = NonNullable<components['schemas']['playgroundFeatureSchema']['variant']>;
type UnleashStrategy = components['schemas']['playgroundStrategySchema'];
type UnleashSegment = components['schemas']['playgroundSegmentSchema'];
type UnleashConstraint = components['schemas']['playgroundConstraintSchema'];

export const createEvaluate =
  (unleash: UnleashClient) =>
    async ({ queries }: EvaluateInput): Promise<EvaluateOutput> => ({ results: await Promise.all(queries.map((query) => evaluate(unleash, query))) });

const evaluate = async (unleash: UnleashClient, { flag, environment, context }: EvaluateQuery): Promise<EvaluateResult> => {
  const evaluated = await unleash.POST('/api/admin/playground/features/{featureName}', {
    params: { path: { featureName: flag } },
    body: { environment, context },
  });
  if (!evaluated.response.ok || !evaluated.data) return { ...toFailed(evaluated), flag, environment };
  const { isEnabled, isEnabledInCurrentEnvironment, hasUnsatisfiedDependency, strategies, variant } = evaluated.data.feature;
  // Unleash answers unknown for a disabled target, but SDKs never get one.
  const onlySdksCanTell = isEnabledInCurrentEnvironment && !hasUnsatisfiedDependency && strategies.data.some((s) => !s.disabled && s.result.enabled === 'unknown');
  return {
    kind: 'evaluated',
    flag,
    environment,
    result: isEnabled ? 'on' : onlySdksCanTell ? 'unknown' : 'off',
    ...(variant?.enabled ? { value: toValue(variant) } : {}),
    ...(strategies.data.length ? { targets: strategies.data.map((strategy) => toTarget(strategy, context)) } : {}),
  };
};

const toValue = ({ name, payload }: UnleashVariant): ServedValue => ({ name, ...(payload ? { payload } : {}) });

const toTarget = (strategy: UnleashStrategy, context: EvaluateQuery['context']): EvaluatedTarget => {
  const named = strategy.title ? { name: strategy.title } : {};
  if (strategy.disabled) return { ...named, result: 'disabled' };
  if (strategy.result.enabled === 'unknown') return { ...named, result: 'unknown', matchedBy: passedConditions(strategy) };
  if (strategy.result.enabled) return { ...named, result: 'matched', matchedBy: { ...passedConditions(strategy), ...partialRollout(strategy) } };
  const failed = failedConditions(strategy);
  const keptOutByRollout = !failed.segments && !failed.constraints && hasStickinessValue(strategy, context);
  return { ...named, result: 'missed', missedBy: keptOutByRollout ? partialRollout(strategy) : failed };
};

// Unleash misses a rollout whose stickiness field the context lacks before it checks the percentage.
const hasStickinessValue = ({ parameters }: UnleashStrategy, context: EvaluateQuery['context']) => {
  const stickiness = parameters.stickiness ?? 'default';
  return stickiness === 'default' || stickiness === 'random' || Boolean(context[stickiness]);
};

const partialRollout = ({ parameters }: UnleashStrategy): Conditions => {
  const rollout = Number(parameters.rollout ?? 100);
  return rollout < 100 ? { rollout } : {};
};

const passedConditions = ({ segments, constraints }: UnleashStrategy): Conditions =>
  toConditions(segments.filter((s) => s.result), constraints.filter((c) => c.result));

const failedConditions = ({ segments, constraints }: UnleashStrategy): Conditions =>
  toConditions(segments.filter((s) => !s.result), constraints.filter((c) => !c.result));

const toConditions = (segments: UnleashSegment[], constraints: UnleashConstraint[]): Conditions => ({
  ...(segments.length ? { segments: segments.map(({ id, name }) => ({ id, name })) } : {}),
  ...(constraints.length ? { constraints: constraints.map(toConstraint) } : {}),
});
