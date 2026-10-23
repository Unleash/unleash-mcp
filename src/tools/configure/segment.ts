import type { UnleashClient } from '../../unleash/client.ts';
import type { CreateSegment, UpdateSegment } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';
import { toFailed } from '../shared/failed.ts';
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
