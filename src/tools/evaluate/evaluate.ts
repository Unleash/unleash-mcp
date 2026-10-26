import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import type { EvaluateInput, EvaluateQuery } from './evaluateInput.ts';
import type { EvaluateOutput, EvaluateResult, EvaluatedTarget, ServedValue } from './evaluateOutput.ts';
import { toFailed } from '../shared/failed.ts';

type UnleashVariant = NonNullable<components['schemas']['playgroundFeatureSchema']['variant']>;
type UnleashStrategy = components['schemas']['playgroundStrategySchema'];

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
    ...(strategies.data.length ? { targets: strategies.data.map(toTarget) } : {}),
  };
};

const toValue = ({ name, payload }: UnleashVariant): ServedValue => ({ name, ...(payload ? { payload } : {}) });

const toTarget = ({ title, disabled, result }: UnleashStrategy): EvaluatedTarget => ({
  ...(title ? { name: title } : {}),
  result: disabled ? 'disabled' : result.enabled === 'unknown' ? 'unknown' : result.enabled ? 'matched' : 'missed',
});
