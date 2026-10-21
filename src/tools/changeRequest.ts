import type { UnleashClient } from '../unleash/client.ts';
import { type Failed, toFailed } from './failed.ts';

const uiConfig = '/api/admin/ui-config';
const config = '/api/admin/projects/{projectId}/change-requests/config';

type Edition = { kind: 'enterprise' } | { kind: 'other' };

// How a release's writes reach the environment.
export type Route = { kind: 'direct' } | { kind: 'changeRequest' };

// Only Enterprise has change requests, so other editions skip reading the config.
// The edition doesn't change while the server runs: it is read once, and a failed read is tried again on the next call.
export const createRouter = (unleash: UnleashClient) => {
  let edition: Edition | undefined;
  return async (project: string, environment: string): Promise<Route | Failed> => {
    const read = edition ?? (await readEdition(unleash));
    if (read.kind === 'failed') return read;
    edition = read;
    if (edition.kind === 'other') return { kind: 'direct' };

    const found = await unleash.GET(config, { params: { path: { projectId: project } } });
    if (!found.response.ok) return toFailed(found);
    const required = found.data?.some((c) => c.environment === environment && c.changeRequestEnabled);
    return { kind: required ? 'changeRequest' : 'direct' };
  };
};

// The same rule as the Unleash UI: Pro builds also carry an enterprise version, so they are told apart by `environment`.
const readEdition = async (unleash: UnleashClient): Promise<Edition | Failed> => {
  const found = await unleash.GET(uiConfig);
  if (!found.response.ok) return toFailed(found);
  const enterprise = Boolean(found.data?.versionInfo.current.enterprise) && found.data?.environment?.toLowerCase() !== 'pro';
  return { kind: enterprise ? 'enterprise' : 'other' };
};
