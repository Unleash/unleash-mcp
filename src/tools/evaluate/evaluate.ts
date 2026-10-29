import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { toConstraint } from '../shared/constraint.ts';
import { toFailed } from '../shared/failed.ts';
import type { EvaluateInput, EvaluateQuery } from './evaluateInput.ts';
import type {
  Blocker,
  Conditions,
  EvaluatedTarget,
  EvaluateOutput,
  EvaluateResult,
  ServedValue,
} from './evaluateOutput.ts';

type UnleashVariant = NonNullable<components['schemas']['playgroundFeatureSchema']['variant']>;
type UnleashStrategy = components['schemas']['playgroundStrategySchema'];
type UnleashSegment = components['schemas']['playgroundSegmentSchema'];
type UnleashConstraint = components['schemas']['playgroundConstraintSchema'];

export const createEvaluate =
  (unleash: UnleashClient) =>
  async ({ queries }: EvaluateInput): Promise<EvaluateOutput> => ({
    results: await Promise.all(queries.map((query) => evaluate(unleash, query))),
  });

const evaluate = async (
  unleash: UnleashClient,
  { flag, environment, context }: EvaluateQuery,
): Promise<EvaluateResult> => {
  const evaluated = await unleash.POST('/api/admin/playground/features/{featureName}', {
    params: { path: { featureName: flag } },
    body: { environment, context },
  });
  if (!evaluated.response.ok || !evaluated.data) return { ...toFailed(evaluated), flag, environment };
  const { isEnabled, isEnabledInCurrentEnvironment, hasUnsatisfiedDependency, strategies, variant } =
    evaluated.data.feature;
  const blockedBy: Blocker[] = [
    ...(isEnabledInCurrentEnvironment ? [] : ['environment' as const]),
    ...(hasUnsatisfiedDependency ? ['parent' as const] : []),
  ];
  // Unleash answers unknown for a disabled target, but SDKs never get one.
  const onlySdksCanTell =
    !blockedBy.length && strategies.data.some((s) => !s.disabled && s.result.enabled === 'unknown');
  return {
    kind: 'evaluated',
    flag,
    environment,
    result: isEnabled ? 'enabled' : onlySdksCanTell ? 'unknown' : 'disabled',
    ...(blockedBy.length ? { blockedBy } : {}),
    ...(variant?.enabled ? { value: toValue(variant) } : {}),
    ...(strategies.data.length ? { targets: strategies.data.map((strategy) => toTarget(strategy, context)) } : {}),
  };
};

const toValue = ({ name, payload }: UnleashVariant): ServedValue => ({
  name,
  ...(payload ? { payload: { type: payload.type, value: payload.value } } : {}),
});

const toTarget = (strategy: UnleashStrategy, context: EvaluateQuery['context']): EvaluatedTarget => {
  const named = strategy.title ? { name: strategy.title } : {};
  if (strategy.disabled) return { ...named, result: 'disabled' };
  if (strategy.result.enabled === 'unknown')
    return { ...named, result: 'unknown', strategy: strategy.name, matchedBy: passedConditions(strategy) };
  const stickiness = stickinessField(strategy.parameters.stickiness || 'default', context);
  if (strategy.result.enabled)
    return {
      ...named,
      result: 'matched',
      matchedBy: { ...passedConditions(strategy), ...rolloutConditions(strategy, stickiness) },
    };
  const failed = failedConditions(strategy);
  if (failed.segments || failed.constraints) return { ...named, result: 'missed', missedBy: failed };
  // Unleash misses a rollout whose stickiness field the context lacks before it checks the percentage.
  const lacksStickiness = stickiness !== 'random' && !context[stickiness];
  return {
    ...named,
    result: 'missed',
    missedBy: lacksStickiness ? { stickiness } : rolloutConditions(strategy, stickiness),
  };
};

const rolloutConditions = ({ parameters }: UnleashStrategy, stickiness: string): Conditions => {
  const rollout = Number(parameters.rollout ?? 100);
  return rollout < 100 ? { rollout, stickiness } : {};
};

// Unleash's default sticks to userId, then sessionId, then a new random draw on every call.
const stickinessField = (stickiness: string, context: EvaluateQuery['context']) => {
  if (stickiness !== 'default') return stickiness;
  return context.userId ? 'userId' : context.sessionId ? 'sessionId' : 'random';
};

const passedConditions = ({ segments, constraints }: UnleashStrategy): Conditions =>
  toConditions(
    segments.filter((s) => s.result),
    constraints.filter((c) => c.result),
  );

const failedConditions = ({ segments, constraints }: UnleashStrategy): Conditions =>
  toConditions(
    segments.filter((s) => !s.result),
    constraints.filter((c) => !c.result),
  );

const toConditions = (segments: UnleashSegment[], constraints: UnleashConstraint[]): Conditions => ({
  ...(segments.length ? { segments: segments.map(({ id, name }) => ({ id, name })) } : {}),
  ...(constraints.length ? { constraints: constraints.map(toConstraint) } : {}),
});
