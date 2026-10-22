import type { UnleashClient } from '../unleash/client.ts';
import type { CreateContextField, DeleteContextField, UpdateContextField } from './configureInput.ts';
import type { ConfigureResult } from './configureOutput.ts';
import { toFailed } from './failed.ts';

/** Creates a context field, global or in a project, answering Unleash's refusal (e.g. the name is taken) as `failed`. */
export const createContextField = async (unleash: UnleashClient, { project, name, description, stickiness, legalValues }: CreateContextField): Promise<ConfigureResult> => {
  const body = { name, description, stickiness, legalValues };
  const created = project
    ? await unleash.POST('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project } }, body })
    : await unleash.POST('/api/admin/context', { body });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created', resource: 'context_field', name };
};

/** Replaces a context field with the given properties, as Unleash's update does: whatever is left out is reset. */
export const updateContextField = async (unleash: UnleashClient, { project, name, description, stickiness, legalValues }: UpdateContextField): Promise<ConfigureResult> => {
  const body = { description, stickiness, legalValues };
  const updated = project
    ? await unleash.PUT('/api/admin/projects/{projectId}/context/{contextField}', { params: { path: { projectId: project, contextField: name } }, body })
    : await unleash.PUT('/api/admin/context/{contextField}', { params: { path: { contextField: name } }, body });
  if (!updated.response.ok) return toFailed(updated);
  return { kind: 'updated', resource: 'context_field', name };
};

/** Deletes a context field, answering Unleash's refusal (e.g. a flag still uses it) as `failed`. */
export const deleteContextField = async (unleash: UnleashClient, { project, name }: DeleteContextField): Promise<ConfigureResult> => {
  const deleted = project
    ? await unleash.DELETE('/api/admin/projects/{projectId}/context/{contextField}', { params: { path: { projectId: project, contextField: name } } })
    : await unleash.DELETE('/api/admin/context/{contextField}', { params: { path: { contextField: name } } });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'deleted', resource: 'context_field', name };
};
