import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import type { EnvironmentsQuery } from '../searchInput.ts';
import type { Environments } from '../searchOutput.ts';

// Unleash lists environments without a filter, so the query is applied here. Every environment of the instance, as the UI's
// event log offers them: deprecated ones keep their history.
export const searchEnvironments = async (
  unleash: UnleashClient,
  { query }: EnvironmentsQuery,
): Promise<Environments | Failed> => {
  const listed = await unleash.GET('/api/admin/environments');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const text = query?.toLowerCase();
  const environments = listed.data.environments
    .filter((e) => !text || e.name.toLowerCase().includes(text))
    .map(({ name, type, enabled }) => ({ name, type, ...(enabled ? {} : { deprecated: true as const }) }));
  return { kind: 'environments', environments };
};
