import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { CreateLegalValue, DeleteLegalValue } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';

/** Adds a legal value to a context field. Unleash overwrites the description of a value that already exists. */
export const createLegalValue = async (
  unleash: UnleashClient,
  { project, field, value, description }: CreateLegalValue,
): Promise<Outcome> => {
  const body = { value, description };
  const created = project
    ? await unleash.POST('/api/admin/projects/{projectId}/context/{contextField}/legal-values', {
        params: { path: { projectId: project, contextField: field } },
        body,
      })
    : await unleash.POST('/api/admin/context/{contextField}/legal-values', {
        params: { path: { contextField: field } },
        body,
      });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'applied' };
};

/** Removes a legal value from a context field. Unleash answers success for a value that is not there. */
export const deleteLegalValue = async (
  unleash: UnleashClient,
  { project, field, value }: DeleteLegalValue,
): Promise<Outcome> => {
  const deleted = project
    ? await unleash.DELETE('/api/admin/projects/{projectId}/context/{contextField}/legal-values/{legalValue}', {
        params: { path: { projectId: project, contextField: field, legalValue: value } },
      })
    : await unleash.DELETE('/api/admin/context/{contextField}/legal-values/{legalValue}', {
        params: { path: { contextField: field, legalValue: value } },
      });
  if (!deleted.response.ok) return toFailed(deleted);
  return { kind: 'applied' };
};
