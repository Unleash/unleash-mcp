import { z } from 'zod';
import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

const uiConfig = '/api/admin/ui-config';
const config = '/api/admin/projects/{projectId}/change-requests/config';
const changeRequestState = '/api/admin/projects/{projectId}/change-requests/{id}/state';

export type Edition = { kind: 'enterprise' } | { kind: 'other' };

/** Reads the Unleash edition, to tell whether it has change requests: only Enterprise does. */
export type EditionReader = () => Promise<Edition | Failed>;

/**
 * The edition doesn't change while the server runs: it is read once, and a failed read is tried again on the next call.
 * The read under way is shared, so callers asking at the same time, such as the queries of one inspect, wait for one request.
 */
export const createEditionReader = (unleash: UnleashClient): EditionReader => {
  let edition: Promise<Edition | Failed> | undefined;
  return () => {
    edition ??= readEdition(unleash).then((read) => {
      if (read.kind === 'failed') edition = undefined;
      return read;
    });
    return edition;
  };
};

/** The environments of a project where changes need approval, with their Unleash environment type. Empty outside Enterprise. */
export type ChangeRequestEnvironments = { kind: 'environments'; environments: { environment: string; type: string }[] };

/** Reads the environments of a project where changes need approval. */
export type ChangeRequestReader = (project: string) => Promise<ChangeRequestEnvironments | Failed>;

/**
 * Builds a reader of where a project's changes need approval, so a tool knows whether to write directly or open a change request.
 * Only Enterprise has change requests, so other editions skip reading the config.
 */
export const createChangeRequestReader = (unleash: UnleashClient): ChangeRequestReader => {
  const editionOf = createEditionReader(unleash);
  return async (project) => {
    const edition = await editionOf();
    if (edition.kind === 'failed') return edition;
    if (edition.kind === 'other') return { kind: 'environments', environments: [] };

    const found = await unleash.GET(config, { params: { path: { projectId: project } } });
    if (!found.response.ok) return toFailed(found);
    const environments = (found.data ?? [])
      .filter((c) => c.changeRequestEnabled)
      .map(({ environment, type }) => ({ environment, type }));
    return { kind: 'environments', environments };
  };
};

// The same rule as the Unleash UI: Pro builds also carry an enterprise version, so they are told apart by `environment`.
const readEdition = async (unleash: UnleashClient): Promise<Edition | Failed> => {
  const found = await unleash.GET(uiConfig);
  if (!found.response.ok) return toFailed(found);
  const enterprise =
    Boolean(found.data?.versionInfo.current.enterprise) && found.data?.environment?.toLowerCase() !== 'pro';
  return { kind: enterprise ? 'enterprise' : 'other' };
};

/** How a write reaches Unleash: directly, or as a change request in the environment that needs approval. */
export type Route = { kind: 'direct' } | ChangeRequestRoute;

/** Where a change request goes: the environment of the project that needs approval. */
export type ChangeRequestRoute = { kind: 'changeRequest'; project: string; environment: string };

/** Routes a change to one environment of a project, such as a release: it needs approval when that environment does. */
export const routeToEnvironment = async (
  environmentsOf: ChangeRequestReader,
  project: string,
  environment: string,
): Promise<Route | Failed> => {
  const read = await environmentsOf(project);
  if (read.kind === 'failed') return read;
  const required = read.environments.some((e) => e.environment === environment);
  return required ? { kind: 'changeRequest', project, environment } : { kind: 'direct' };
};

/**
 * Routes a change to the whole project, such as a project segment: Unleash refuses the write when any of the project's
 * environments needs approval, unless the user may skip change requests. The change request goes where the Unleash UI
 * puts it: a production environment first.
 */
export const routeToProject = async (environmentsOf: ChangeRequestReader, project: string): Promise<Route | Failed> => {
  const read = await environmentsOf(project);
  if (read.kind === 'failed') return read;
  const found = read.environments.find((e) => e.type === 'production') ?? read.environments[0];
  return found ? { kind: 'changeRequest', project, environment: found.environment } : { kind: 'direct' };
};

const changeRequests = '/api/admin/projects/{projectId}/environments/{environment}/change-requests';

/** One change, or several approved or rejected as a whole, in Unleash's change request shape. */
export type Changes = components['schemas']['changeRequestOneOrManyCreateSchema'];

export const changeRequest = z.object({
  id: z.number(),
  state: z.string(),
  url: z.string().describe('Where people review it in the Unleash UI'),
});

export type ChangeRequest = z.infer<typeof changeRequest>;

/** A change request opened and submitted for review, as the agent reports it back. */
export type Requested = { kind: 'requested'; changeRequest: ChangeRequest };

/** Opens a change request in the environment and submits it for review. */
export const requestChanges = async (
  unleash: UnleashClient,
  { project, environment }: ChangeRequestRoute,
  changes: Changes,
): Promise<Requested | Failed> => {
  const created = await unleash.POST(changeRequests, {
    params: { path: { projectId: project, environment } },
    body: changes,
  });
  if (!created.response.ok || !created.data) return toFailed(created);
  return submitForReview(unleash, project, created.data);
};

/**
 * Submits a change request Unleash just opened or added to, so it waits for review rather than sitting in a draft.
 * Unleash adds changes to the user's open draft, if any, and the whole draft is submitted, other changes included.
 */
const submitForReview = async (
  unleash: UnleashClient,
  projectId: string,
  { id, state }: { id: number; state: string },
): Promise<Requested | Failed> => {
  // Unleash refuses to submit a change request again, so one that is already past draft is left as it is.
  if (state !== 'Draft')
    return { kind: 'requested', changeRequest: { id, state, url: changeRequestUrl(unleash, projectId, id) } };

  const submitted = await unleash.PUT(changeRequestState, {
    params: { path: { projectId, id: String(id) } },
    // The OpenAPI spec omits this endpoint's body.
    body: submit as never,
  });
  if (!submitted.response.ok || !submitted.data) return toFailed(submitted);
  return {
    kind: 'requested',
    changeRequest: {
      id: submitted.data.id,
      state: submitted.data.state,
      url: changeRequestUrl(unleash, projectId, submitted.data.id),
    },
  };
};

/** The Unleash UI's route for a change request, where people review it. */
export const changeRequestUrl = ({ baseUrl }: UnleashClient, projectId: string, id: number): string =>
  `${baseUrl}/projects/${encodeURIComponent(projectId)}/change-requests/${id}`;

const submit: components['schemas']['changeRequestStateSchema'] = { state: 'In review' };
