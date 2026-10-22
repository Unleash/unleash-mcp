import type { UnleashClient } from '../unleash/client.ts';
import type { CreateLegalValue } from './configureInput.ts';
import type { ConfigureResult } from './configureOutput.ts';
import { toFailed } from './failed.ts';

/** Adds a legal value to a global context field. Unleash overwrites the description of a value that already exists. */
export const createLegalValue = async (unleash: UnleashClient, { field, value, description }: CreateLegalValue): Promise<ConfigureResult> => {
  const created = await unleash.POST('/api/admin/context/{contextField}/legal-values', {
    params: { path: { contextField: field } },
    body: { value, description },
  });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created', resource: 'legal_value', field, value };
};
