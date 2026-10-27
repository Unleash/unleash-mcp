import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import type { FlagState } from '../shared/flagState.ts';

const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';

// The flag as the release finds it in the environment.
type Flag = { kind: 'new' | 'existing'; enabled: boolean; strategyIds: string[] };
export type FlagStatus = Flag | Failed;

type FlagInput = { flag: string; state: FlagState; environment: string };

export const ensureFlag = async (unleash: UnleashClient, project: string, input: FlagInput): Promise<FlagStatus> => {
  const found = await unleash.GET(feature, { params: { path: { projectId: project, featureName: input.flag } } });
  if (found.response.ok) {
    const environment = found.data?.environments?.find((e) => e.name === input.environment);
    const strategies = environment?.strategies ?? [];
    const notGradual = strategies.filter((s) => !gradual.includes(s.name)).map((s) => s.title || s.name);
    if (notGradual.length) return notGradualIn(input.environment, notGradual);
    const strategyIds = strategies.flatMap((s) => (s.id ? [s.id] : []));
    return { kind: 'existing', enabled: environment?.enabled ?? false, strategyIds };
  }
  const missing = found.response.status === 404;
  const turningOn = input.state === 'on';
  if (!missing || !turningOn) return toFailed(found);

  const created = await unleash.POST(features, { params: { path: { projectId: project } }, body: { name: input.flag } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'new', enabled: false, strategyIds: [] };
};

// Unleash's legacy `default` serves everyone, as a 100% gradual rollout does, so rewriting it as one changes nothing.
const gradual = ['flexibleRollout', 'default'];

// Release only writes gradual rollouts, so it would turn a target such as IPs into a gradual rollout for everyone, or drop it.
const notGradualIn = (environment: string, targets: string[]): Failed => ({
  kind: 'failed',
  status: 409,
  name: 'ConflictError',
  reasons: [`${environment} has targets that are not gradual rollouts (${targets.join(', ')}); change them in the Unleash UI first`],
});
