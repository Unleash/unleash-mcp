import type { UnleashClient } from '../../unleash/client.ts';
import type { CreateSegment } from './configureInput.ts';
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
