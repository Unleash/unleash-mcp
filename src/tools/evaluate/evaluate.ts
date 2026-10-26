import type { UnleashClient } from '../../unleash/client.ts';
import type { EvaluateInput, EvaluateQuery } from './evaluateInput.ts';
import type { EvaluateOutput, EvaluateResult } from './evaluateOutput.ts';
import { toFailed } from '../shared/failed.ts';

export const createEvaluate =
  (unleash: UnleashClient) =>
    async ({ queries }: EvaluateInput): Promise<EvaluateOutput> => ({ results: await Promise.all(queries.map((query) => evaluate(unleash, query))) });

const evaluate = async (unleash: UnleashClient, { flag, environment, context }: EvaluateQuery): Promise<EvaluateResult> => {
  const evaluated = await unleash.POST('/api/admin/playground/features/{featureName}', {
    params: { path: { featureName: flag } },
    body: { environment, context },
  });
  if (!evaluated.response.ok || !evaluated.data) return { ...toFailed(evaluated), flag, environment };
  const { isEnabled, isEnabledInCurrentEnvironment, hasUnsatisfiedDependency, strategies } = evaluated.data.feature;
  const onlySdksCanTell = isEnabledInCurrentEnvironment && !hasUnsatisfiedDependency && strategies.result === 'unknown';
  return { kind: 'evaluated', flag, environment, result: isEnabled ? 'on' : onlySdksCanTell ? 'unknown' : 'off' };
};
