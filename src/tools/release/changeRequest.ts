import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import type { EnvironmentPath, Plan } from './releasePlan.ts';

const uiConfig = '/api/admin/ui-config';
const config = '/api/admin/projects/{projectId}/change-requests/config';
const changeRequests = '/api/admin/projects/{projectId}/environments/{environment}/change-requests';
const changeRequestState = '/api/admin/projects/{projectId}/change-requests/{id}/state';

type Edition = { kind: 'enterprise' } | { kind: 'other' };

// How a release's writes reach the environment.
export type Route = { kind: 'direct' } | { kind: 'changeRequest' };

// Only Enterprise has change requests, so other editions skip reading the config.
// The edition doesn't change while the server runs: it is read once, and a failed read is tried again on the next call.
export const createRouter = (unleash: UnleashClient) => {
  let edition: Edition | undefined;
  return async (project: string, environment: string): Promise<Route | Failed> => {
    const read = edition ?? (await readEdition(unleash));
    if (read.kind === 'failed') return read;
    edition = read;
    if (edition.kind === 'other') return { kind: 'direct' };

    const found = await unleash.GET(config, { params: { path: { projectId: project } } });
    if (!found.response.ok) return toFailed(found);
    const required = found.data?.some((c) => c.environment === environment && c.changeRequestEnabled);
    return { kind: required ? 'changeRequest' : 'direct' };
  };
};

// The same rule as the Unleash UI: Pro builds also carry an enterprise version, so they are told apart by `environment`.
const readEdition = async (unleash: UnleashClient): Promise<Edition | Failed> => {
  const found = await unleash.GET(uiConfig);
  if (!found.response.ok) return toFailed(found);
  const enterprise = Boolean(found.data?.versionInfo.current.enterprise) && found.data?.environment?.toLowerCase() !== 'pro';
  return { kind: enterprise ? 'enterprise' : 'other' };
};

export type Requested = { kind: 'requested'; changeRequest: { id: number; state: string } };

// All of a release goes into one change request, so it is approved or rejected as a whole. Unleash adds it to the
// user's open draft, if any, and the whole draft is submitted for review unless it already was.
export const requestChanges = async (unleash: UnleashClient, path: EnvironmentPath, plan: Plan): Promise<Requested | Failed> => {
  const feature = path.featureName;
  const changes = [
    ...plan.updates.map(({ id, strategy }) => ({ feature, action: 'updateStrategy' as const, payload: { id, ...strategy } })),
    ...plan.adds.map((strategy) => ({ feature, action: 'addStrategy' as const, payload: strategy })),
    ...plan.deletes.map((id) => ({ feature, action: 'deleteStrategy' as const, payload: { id } })),
    ...(plan.enable ? [{ feature, action: 'updateEnabled' as const, payload: { enabled: true } }] : []),
  ];
  const created = await unleash.POST(changeRequests, {
    params: { path: { projectId: path.projectId, environment: path.environment } },
    body: changes,
  });
  if (!created.response.ok || !created.data) return toFailed(created);
  // Unleash refuses to submit a change request again, so one that is already past draft is left as it is.
  if (created.data.state !== 'Draft') return { kind: 'requested', changeRequest: { id: created.data.id, state: created.data.state } };

  const submitted = await unleash.PUT(changeRequestState, {
    params: { path: { projectId: path.projectId, id: String(created.data.id) } },
    // The OpenAPI spec omits this endpoint's body.
    body: submit as never,
  });
  if (!submitted.response.ok || !submitted.data) return toFailed(submitted);
  return { kind: 'requested', changeRequest: { id: submitted.data.id, state: submitted.data.state } };
};

const submit: components['schemas']['changeRequestStateSchema'] = { state: 'In review' };
