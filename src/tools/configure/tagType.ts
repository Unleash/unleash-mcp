import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { CreateTagType, DeleteTagType, UpdateTagType } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';

export const createTagType = async (unleash: UnleashClient, { name, description }: CreateTagType): Promise<Outcome> => {
  const created = await unleash.POST('/api/admin/tag-types', { body: { name, description } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'applied' };
};

export const updateTagType = async (unleash: UnleashClient, { name, description }: UpdateTagType): Promise<Outcome> => {
  const updated = await unleash.PUT('/api/admin/tag-types/{name}', {
    params: { path: { name } },
    body: { description: description ?? '' },
  });
  if (!updated.response.ok) return toFailed(updated);
  return { kind: 'applied' };
};

/** Deletes a tag type and, with it, its tags on every flag, as the UI does. */
export const deleteTagType = async (unleash: UnleashClient, { name }: DeleteTagType): Promise<Outcome> => {
  const deleted = await unleash.DELETE('/api/admin/tag-types/{name}', { params: { path: { name } } });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'applied' };
};
