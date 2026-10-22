import type { UnleashClient } from '../unleash/client.ts';
import type { CreateLegalValue, DeleteLegalValue } from './configureInput.ts';
import type { ConfigureResult } from './configureOutput.ts';
import { toFailed } from './failed.ts';

/** Adds a legal value to a context field. Unleash overwrites the description of a value that already exists. */
export const createLegalValue = async (unleash: UnleashClient, { project, field, value, description }: CreateLegalValue): Promise<ConfigureResult> => {
  const body = { value, description };
  const created = project
    ? await unleash.POST('/api/admin/projects/{projectId}/context/{contextField}/legal-values', { params: { path: { projectId: project, contextField: field } }, body })
    : await unleash.POST('/api/admin/context/{contextField}/legal-values', { params: { path: { contextField: field } }, body });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created', resource: 'legal_value', field, value };
};

/** Removes a legal value from a context field. Unleash answers success for a value that is not there. */
export const deleteLegalValue = async (unleash: UnleashClient, { project, field, value }: DeleteLegalValue): Promise<ConfigureResult> => {
  const deleted = project
    ? await unleash.DELETE('/api/admin/projects/{projectId}/context/{contextField}/legal-values/{legalValue}', {
      params: { path: { projectId: project, contextField: field, legalValue: value } },
    })
    : await unleash.DELETE('/api/admin/context/{contextField}/legal-values/{legalValue}', {
      params: { path: { contextField: field, legalValue: value } },
    });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'deleted', resource: 'legal_value', field, value };
};
