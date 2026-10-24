import type { UnleashClient } from '../../unleash/client.ts';
import type { Complete } from './flagLifecycleInput.ts';
import type { Outcome } from './flagLifecycleOutput.ts';
import { toFailed } from '../shared/failed.ts';

/** Marks a flag completed, answering Unleash's refusal (e.g. no such flag) as `failed`. Completion is a note, so it needs no review. */
export const completeFlag = async (unleash: UnleashClient, { project, flag, outcome }: Complete): Promise<Outcome> => {
  const completed = await unleash.POST('/api/admin/projects/{projectId}/features/{featureName}/lifecycle/complete', {
    params: { path: { projectId: project, featureName: flag } },
    body: { status: outcome.kind, ...(outcome.kind === 'kept' && outcome.value !== undefined ? { statusValue: outcome.value } : {}) },
  });
  if (!completed.response.ok) return toFailed(completed);
  return { kind: 'applied' };
};
