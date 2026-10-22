import type { UnleashClient } from '../unleash/client.ts';
import type { CreateContextField } from './configureInput.ts';
import type { ConfigureResult } from './configureOutput.ts';
import { toFailed } from './failed.ts';

/** Creates a global context field, answering Unleash's refusal (e.g. the name is taken) as `failed`. */
export const createContextField = async (unleash: UnleashClient, { name, description }: CreateContextField): Promise<ConfigureResult> => {
  const created = await unleash.POST('/api/admin/context', { body: { name, description } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created', resource: 'context_field', name };
};
