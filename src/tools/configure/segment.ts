import type { UnleashClient } from '../../unleash/client.ts';
import type { CreateSegment, DeleteSegment, UpdateSegment } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import { toUnleashConstraint } from '../shared/strategy.ts';

/** Creates a segment, global or in a project, answering with its id so release targets can refer to it. */
export const createSegment = async (unleash: UnleashClient, { project, name, description, constraints }: CreateSegment): Promise<Outcome> => {
  const body = { name, description, project, constraints: constraints.map(toUnleashConstraint) };
  const created = await unleash.POST('/api/admin/segments', { body });
  if (!created.response.ok || !created.data) return toFailed(created);
  return { kind: 'applied', id: created.data.id };
};

/** Replaces a segment as Unleash's update does: a left out project makes it global, a left out description stays. */
export const updateSegment = async (unleash: UnleashClient, { id, project, name, description, constraints }: UpdateSegment): Promise<Outcome> => {
  const body = { name, description, project, constraints: constraints.map(toUnleashConstraint) };
  const updated = await unleash.PUT('/api/admin/segments/{id}', { params: { path: { id } }, body });
  if (!updated.response.ok) return toFailed(updated);
  return { kind: 'applied' };
};

/** Deletes a segment, answering Unleash's refusal (e.g. a flag still targets it) as `failed`. Unleash answers success for a segment that is not there. */
export const deleteSegment = async (unleash: UnleashClient, { id }: DeleteSegment): Promise<Outcome> => {
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
