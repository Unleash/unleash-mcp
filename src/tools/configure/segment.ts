import type { UnleashClient } from '../../unleash/client.ts';
import type { CreateSegment, DeleteSegment, UpdateSegment } from './configureInput.ts';
import type { Outcome, PendingChange } from './configureOutput.ts';
import type { components } from '../../unleash/api.d.ts';
import { type ChangeRequestReader, submitForReview } from '../shared/changeRequest.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { toUnleashConstraint } from '../shared/strategy.ts';

/** Creates a segment, global or in a project, answering with its id so release targets can refer to it. */
export const createSegment = async (unleash: UnleashClient, { project, name, description, constraints }: CreateSegment): Promise<Outcome> => {
  const body = { name, description, project, constraints: constraints.map(toUnleashConstraint) };
  const created = await unleash.POST('/api/admin/segments', { body });
  if (!created.response.ok || !created.data) return toFailed(created);
  return { kind: 'applied', id: created.data.id };
};

const changeRequests = '/api/admin/projects/{projectId}/environments/{environment}/change-requests';

/**
 * Replaces a segment as Unleash's update does: a left out project makes it global, a left out description stays.
 * A segment going into a project whose changes need approval waits in a change request, as Unleash refuses the write.
 */
export const updateSegment = async (
  unleash: UnleashClient,
  environmentsOf: ChangeRequestReader,
  { id, project, name, description, constraints }: UpdateSegment,
): Promise<Outcome | PendingChange> => {
  const body = { name, description, project, constraints: constraints.map(toUnleashConstraint) };
  const route = await routeOf(environmentsOf, project);
  if (route.kind === 'failed') return route;
  // The OpenAPI spec leaves the segment id out of the payload, but Unleash needs it, as its UI sends it.
  const payload = { id, ...body };
  if (route.kind === 'changeRequest') return requestChange(unleash, route, { action: 'updateSegment', payload });
  const updated = await unleash.PUT('/api/admin/segments/{id}', { params: { path: { id } }, body });
  if (!updated.response.ok) return toFailed(updated);
  return { kind: 'applied' };
};

/**
 * Deletes a segment, answering Unleash's refusal (e.g. a flag still targets it) as `failed`. Unleash answers success for a segment that is not there.
 * A segment in a project whose changes need approval waits in a change request; without its project, Unleash's refusal comes back as `failed`.
 */
export const deleteSegment = async (unleash: UnleashClient, environmentsOf: ChangeRequestReader, { id, project }: DeleteSegment): Promise<Outcome | PendingChange> => {
  const route = await routeOf(environmentsOf, project);
  if (route.kind === 'failed') return route;
  if (route.kind === 'changeRequest') return requestChange(unleash, route, { action: 'deleteSegment', payload: { id } });
  const deleted = await unleash.DELETE('/api/admin/segments/{id}', { params: { path: { id } } });
  if (deleted.response.status === 409) return inUse;
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'applied' };
};

// Unleash answers a segment in use with a bare 409, which would leave the agent without a reason.
const inUse: Failed = {
  kind: 'failed',
  status: 409,
  name: 'ConflictError',
  reasons: ['A flag still targets the segment; inspect the segment with usage to find which'],
};

type Route = { kind: 'direct' } | { kind: 'changeRequest'; project: string; environment: string };

// Unleash refuses to write a project segment when any of the project's environments needs approval, unless the user may
// skip change requests. The change request goes where the Unleash UI puts it: a production environment first.
const routeOf = async (environmentsOf: ChangeRequestReader, project: string | undefined): Promise<Route | Failed> => {
  if (!project) return { kind: 'direct' };
  const read = await environmentsOf(project);
  if (read.kind === 'failed') return read;
  const found = read.environments.find((e) => e.type === 'production') ?? read.environments[0];
  return found ? { kind: 'changeRequest', project, environment: found.environment } : { kind: 'direct' };
};

type SegmentChange = Extract<components['schemas']['changeRequestOneOrManyCreateSchema'], { action: 'updateSegment' | 'deleteSegment' }>;

const requestChange = async (unleash: UnleashClient, { project, environment }: Route & { kind: 'changeRequest' }, change: SegmentChange): Promise<PendingChange | Failed> => {
  const created = await unleash.POST(changeRequests, { params: { path: { projectId: project, environment } }, body: change });
  if (!created.response.ok || !created.data) return toFailed(created);
  const submitted = await submitForReview(unleash, project, created.data);
  if (submitted.kind === 'failed') return submitted;
  return { kind: 'pending_change_request', changeRequest: submitted.changeRequest };
};
