import type { components } from '../unleash/api.d.ts';
import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, Target } from './target.ts';
import type { Lookup } from './searchSpikeInput.ts';
import type { SearchResult } from './searchSpikeOutput.ts';
import { toFailed } from './failed.ts';

type Strategy = components['schemas']['featureStrategySchema'];
type UnleashConstraint = components['schemas']['constraintSchema'];
type LookupOf<K extends Lookup['kind']> = Extract<Lookup, { kind: K }>;

export const createSearchSpike =
  (unleash: UnleashClient) =>
    async ({ lookup }: { lookup: Lookup }): Promise<SearchResult> => {
      switch (lookup.kind) {
        case 'projects': return searchProjects(unleash, lookup);
        case 'environments': return searchEnvironments(unleash, lookup);
        case 'segments': return searchSegments(unleash, lookup);
        case 'flags': return searchFlags(unleash, lookup);
        case 'contextFields': return searchContextFields(unleash, lookup);
        case 'audiences': return searchAudiences(unleash, lookup);
      }
    };

// Unleash has no search parameter for these lists, so the query is applied here.
const matches = (query: string | undefined, ...texts: string[]): boolean =>
  !query || texts.some((t) => t.toLowerCase().includes(query.toLowerCase()));

const searchProjects = async (unleash: UnleashClient, { query }: LookupOf<'projects'>): Promise<SearchResult> => {
  const listed = await unleash.GET('/api/admin/projects', { params: { query: { view: 'core' } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const projects = listed.data.projects.filter((p) => matches(query, p.id, p.name)).map(({ id, name }) => ({ id, name }));
  return { kind: 'projects', projects };
};

// Disabled environments are left out: release cannot use them.
const searchEnvironments = async (unleash: UnleashClient, { project }: LookupOf<'environments'>): Promise<SearchResult> => {
  const listed = await unleash.GET('/api/admin/environments/project/{projectId}', { params: { path: { projectId: project } } });
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  return { kind: 'environments', environments: listed.data.environments.filter((e) => e.enabled).map((e) => e.name) };
};

// A segment is usable in a project when it is global or belongs to that project.
const searchSegments = async (unleash: UnleashClient, { project, query }: LookupOf<'segments'>): Promise<SearchResult> => {
  const listed = await unleash.GET('/api/admin/segments');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const segments = (listed.data.segments ?? [])
    .filter((s) => (!s.project || s.project === project) && matches(query, s.name))
    .map(({ id, name }) => ({ id, name }));
  return { kind: 'segments', segments };
};

// Unleash searches on the server, so large projects stay cheap.
const searchFlags = async (unleash: UnleashClient, { project, query }: LookupOf<'flags'>): Promise<SearchResult> => {
  const found = await unleash.GET('/api/admin/search/features', { params: { query: { project: `IS:${project}`, query } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  return { kind: 'flags', flags: found.data.features.map(({ name }) => ({ name })) };
};

const searchContextFields = async (unleash: UnleashClient, { query }: LookupOf<'contextFields'>): Promise<SearchResult> => {
  const listed = await unleash.GET('/api/admin/context');
  if (!listed.response.ok || !listed.data) return toFailed(listed);
  const fields = listed.data
    .filter((f) => matches(query, f.name))
    .map(({ name, legalValues }) => (legalValues?.length ? { name, legalValues: legalValues.map((v) => v.value) } : { name }));
  return { kind: 'contextFields', fields };
};

const searchAudiences = async (unleash: UnleashClient, lookup: LookupOf<'audiences'>): Promise<SearchResult> => {
  const found = await unleash.GET('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: lookup.project, featureName: lookup.flag } },
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  const environment = found.data.environments?.find((e) => e.name === lookup.environment);
  return { kind: 'audiences', enabled: environment?.enabled ?? false, targets: (environment?.strategies ?? []).map(toTarget) };
};

// The reverse of release's toStrategy. Lossy for anything release cannot write: see docs/search-spike-report.md.
const toTarget = (s: Strategy): Target => {
  const [variant] = s.variants ?? [];
  return {
    name: s.title || s.name,
    rollout: Number(s.parameters?.rollout ?? 100),
    ...(s.constraints?.length ? { constraints: s.constraints.map(toConstraint) } : {}),
    ...(s.segments?.length ? { segments: s.segments } : {}),
    ...(variant ? { value: { name: variant.name, ...(variant.payload ? { payload: variant.payload } : {}) } } : {}),
  };
};

const toConstraint = (c: UnleashConstraint): Constraint => ({
  field: c.contextName,
  operator: c.operator,
  // Single-value operators (numbers, dates, semver) keep their value in `value`.
  values: c.values?.length ? c.values : c.value ? [c.value] : [],
  ...(c.inverted ? { inverted: true } : {}),
  ...(c.caseInsensitive ? { caseInsensitive: true } : {}),
});
