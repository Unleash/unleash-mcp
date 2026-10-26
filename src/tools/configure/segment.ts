import type { UnleashClient } from '../../unleash/client.ts';
import type { CreateSegment, DeleteSegment, UpdateSegment } from './configureInput.ts';
import type { Outcome, PendingChange } from './configureOutput.ts';
import { type ChangeRequestReader, type ChangeRequestRoute, type Changes, requestChanges, type Route, routeToProject } from '../shared/changeRequest.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { toUnleashConstraint } from '../shared/strategy.ts';

/** Creates a segment, global or in a project, answering with its id so release targets can refer to it. */
export const createSegment = async (unleash: UnleashClient, { project, name, description, constraints }: CreateSegment): Promise<Outcome> => {
  const body = { name, description, project, constraints: constraints.map(toUnleashConstraint) };
  const created = await unleash.POST('/api/admin/segments', { body });
  if (!created.response.ok || !created.data) return toFailed(created);
  return { kind: 'applied', id: created.data.id };
};

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

// A global segment is always written directly; a project segment needs approval when any of its environments does.
const routeOf = (environmentsOf: ChangeRequestReader, project: string | undefined): Promise<Route | Failed> =>
  project ? routeToProject(environmentsOf, project) : Promise.resolve({ kind: 'direct' });

type SegmentChange = Extract<Changes, { action: 'updateSegment' | 'deleteSegment' }>;

const requestChange = async (unleash: UnleashClient, route: ChangeRequestRoute, change: SegmentChange): Promise<PendingChange | Failed> => {
  const requested = await requestChanges(unleash, route, change);
  if (requested.kind === 'failed') return requested;
  return { kind: 'pending_change_request', changeRequest: requested.changeRequest };
};
