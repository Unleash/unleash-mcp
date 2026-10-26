import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { createChangeRequestReader, type Requested, submitForReview } from '../shared/changeRequest.ts';
import type { EnvironmentPath, Plan } from './releasePlan.ts';

const changeRequests = '/api/admin/projects/{projectId}/environments/{environment}/change-requests';

// How a release's writes reach the environment.
export type Route = { kind: 'direct' } | { kind: 'changeRequest' };

// A release needs approval when its environment does.
export const createRouter = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async (project: string, environment: string): Promise<Route | Failed> => {
    const read = await environmentsOf(project);
    if (read.kind === 'failed') return read;
    const required = read.environments.some((e) => e.environment === environment);
    return { kind: required ? 'changeRequest' : 'direct' };
  };
};

// All of a release goes into one change request, so it is approved or rejected as a whole. Unleash adds it to the
// user's open draft, if any, and the whole draft is submitted for review unless it already was.
export const requestChanges = async (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<Requested | Failed> => {
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
  const created = await unleash.POST(changeRequests, {
    params: { path: { projectId: path.projectId, environment: path.environment } },
    body: changes,
  });
  if (!created.response.ok || !created.data) return toFailed(created);
  return submitForReview(unleash, path.projectId, created.data);
};
