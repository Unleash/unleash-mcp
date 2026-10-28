import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../failed.ts';
import type { Current } from './plan.ts';

const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';

type UnleashEnvironment = components['schemas']['featureEnvironmentSchema'];

/** A flag as a rollout finds it: each of its environments, or missing, with Unleash's answer saying so. */
export type FoundFlag = { kind: 'found'; environments: UnleashEnvironment[] } | { kind: 'missing'; notFound: Failed };

/** The flag as a rollout finds it in the environment, created on the way when it was missing. */
export type EnsuredFlag = Current & { kind: 'new' | 'existing' };

export const readFlag = async (unleash: UnleashClient, project: string, flag: string): Promise<FoundFlag | Failed> => {
  const found = await unleash.GET(feature, { params: { path: { projectId: project, featureName: flag } } });
  if (found.response.status === 404) return { kind: 'missing', notFound: toFailed(found) };
  if (!found.response.ok) return toFailed(found);
  return { kind: 'found', environments: found.data?.environments ?? [] };
};

export const createFlag = async (unleash: UnleashClient, project: string, flag: string): Promise<{ kind: 'created' } | Failed> => {
  const created = await unleash.POST(features, { params: { path: { projectId: project } }, body: { name: flag } });
  if (!created.response.ok) return toFailed(created);
  return { kind: 'created' };
};

/** What an environment of the flag has now, refusing one with targets a rollout would turn into gradual rollouts or drop. */
export const currentIn = (environments: UnleashEnvironment[], environment: string): Current | Failed => {
  const found = environments.find((e) => e.name === environment);
  const strategies = found?.strategies ?? [];
  const notGradual = strategies.filter((s) => !gradual.includes(s.name)).map((s) => s.title || s.name);
  if (notGradual.length) return notGradualIn(environment, notGradual);
  return { enabled: found?.enabled ?? false, strategyIds: strategies.flatMap((s) => (s.id ? [s.id] : [])) };
};

// Unleash's legacy `default` serves everyone, as a 100% gradual rollout does, so rewriting it as one changes nothing.
const gradual = ['flexibleRollout', 'default'];

const notGradualIn = (environment: string, targets: string[]): Failed => ({
  kind: 'failed',
  status: 409,
  name: 'ConflictError',
  reasons: [`${environment} has targets that are not gradual rollouts (${targets.join(', ')}); change them in the Unleash UI first`],
});
