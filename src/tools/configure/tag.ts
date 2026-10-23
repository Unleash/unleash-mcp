import type { UnleashClient } from '../../unleash/client.ts';
import type { DeleteTag } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';
import { toFailed } from '../shared/failed.ts';

/** Deletes a tag and takes it off every flag, as the UI does. */
export const deleteTag = async (unleash: UnleashClient, { type, value }: DeleteTag): Promise<Outcome> => {
  const deleted = await unleash.DELETE('/api/admin/tags/{type}/{value}', { params: { path: { type, value } } });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'applied' };
};
