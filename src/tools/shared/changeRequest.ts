import type { components } from '../../unleash/api.d.ts';
import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

const uiConfig = '/api/admin/ui-config';
const config = '/api/admin/projects/{projectId}/change-requests/config';
const changeRequestState = '/api/admin/projects/{projectId}/change-requests/{id}/state';

type Edition = { kind: 'enterprise' } | { kind: 'other' };

/** The environments of a project where changes need approval, with their Unleash environment type. Empty outside Enterprise. */
export type ChangeRequestEnvironments = { kind: 'environments'; environments: { environment: string; type: string }[] };

/** Reads the environments of a project where changes need approval. */
export type ChangeRequestReader = (project: string) => Promise<ChangeRequestEnvironments | Failed>;

/**
 * Builds a reader of where a project's changes need approval, so a tool knows whether to write directly or open a change request.
 * Only Enterprise has change requests, so other editions skip reading the config. The edition doesn't change while the
 * server runs: it is read once, and a failed read is tried again on the next call.
 */
export const createChangeRequestReader = (unleash: UnleashClient): ChangeRequestReader => {
  let edition: Edition | undefined;
  return async (project) => {
    const read = edition ?? (await readEdition(unleash));
    if (read.kind === 'failed') return read;
    edition = read;
    if (edition.kind === 'other') return { kind: 'environments', environments: [] };

    const found = await unleash.GET(config, { params: { path: { projectId: project } } });
    if (!found.response.ok) return toFailed(found);
    const environments = (found.data ?? []).filter((c) => c.changeRequestEnabled).map(({ environment, type }) => ({ environment, type }));
    return { kind: 'environments', environments };
  };
};

// The same rule as the Unleash UI: Pro builds also carry an enterprise version, so they are told apart by `environment`.
const readEdition = async (unleash: UnleashClient): Promise<Edition | Failed> => {
  const found = await unleash.GET(uiConfig);
  if (!found.response.ok) return toFailed(found);
  const enterprise = Boolean(found.data?.versionInfo.current.enterprise) && found.data?.environment?.toLowerCase() !== 'pro';
  return { kind: enterprise ? 'enterprise' : 'other' };
};

/** A change request opened and submitted for review, with the id and state the agent reports back. */
export type Requested = { kind: 'requested'; changeRequest: { id: number; state: string } };

/**
 * Submits a change request Unleash just opened or added to, so it waits for review rather than sitting in a draft.
 * Unleash adds changes to the user's open draft, if any, and the whole draft is submitted, other changes included.
 */
export const submitForReview = async (unleash: UnleashClient, projectId: string, { id, state }: { id: number; state: string }): Promise<Requested | Failed> => {
  // Unleash refuses to submit a change request again, so one that is already past draft is left as it is.
  if (state !== 'Draft') return { kind: 'requested', changeRequest: { id, state } };

  const submitted = await unleash.PUT(changeRequestState, {
    params: { path: { projectId, id: String(id) } },
    // The OpenAPI spec omits this endpoint's body.
    body: submit as never,
  });
  if (!submitted.response.ok || !submitted.data) return toFailed(submitted);
  return { kind: 'requested', changeRequest: { id: submitted.data.id, state: submitted.data.state } };
};

const submit: components['schemas']['changeRequestStateSchema'] = { state: 'In review' };
