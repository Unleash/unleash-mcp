import type { UnleashClient } from '../unleash/client.ts';
import type { CreateContextField, DeleteContextField } from './configureInput.ts';
import type { ConfigureResult } from './configureOutput.ts';
import { toFailed } from './failed.ts';

/** Creates a global context field, answering Unleash's refusal (e.g. the name is taken) as `failed`. */
export const createContextField = async (unleash: UnleashClient, { name, description, stickiness, legalValues }: CreateContextField): Promise<ConfigureResult> => {
  const created = await unleash.POST('/api/admin/context', { body: { name, description, stickiness, legalValues } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created', resource: 'context_field', name };
};

/** Deletes a global context field, answering Unleash's refusal (e.g. a flag still uses it) as `failed`. */
export const deleteContextField = async (unleash: UnleashClient, { name }: DeleteContextField): Promise<ConfigureResult> => {
  const deleted = await unleash.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField: name } } });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'deleted', resource: 'context_field', name };
};
