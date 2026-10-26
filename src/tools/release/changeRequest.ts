import type { UnleashClient } from '../../unleash/client.ts';
import type { Failed } from '../shared/failed.ts';
import { type Requested, requestChanges } from '../shared/changeRequest.ts';
import type { EnvironmentPath, Plan } from './releasePlan.ts';

// All of a release goes into one change request, so it is approved or rejected as a whole. Unleash adds it to the
// user's open draft, if any, and the whole draft is submitted for review unless it already was.
export const requestRelease = (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<Requested | Failed> => {
  const feature = path.featureName;
  // Ordered as the direct writes are: disabling first, enabling last.
  const toggle = { feature, action: 'updateEnabled' as const, payload: { enabled: plan.toggle === 'on' } };
  const changes = [
    ...(plan.toggle === 'off' ? [toggle] : []),
    ...plan.updates.map(({ id, strategy }) => ({ feature, action: 'updateStrategy' as const, payload: { id, ...strategy } })),
    ...plan.adds.map((strategy) => ({ feature, action: 'addStrategy' as const, payload: strategy })),
    ...plan.deletes.map((id) => ({ feature, action: 'deleteStrategy' as const, payload: { id } })),
    ...(plan.toggle === 'on' ? [toggle] : []),
  ];
  return requestChanges(unleash, { kind: 'changeRequest', project: path.projectId, environment: path.environment }, changes);
};
