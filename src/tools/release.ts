import { z } from 'zod';
import type { UnleashClient } from '../unleash/client.ts';

// ---------- input ----------

const operators = [
  'IN', 'NOT_IN', 'STR_ENDS_WITH', 'STR_STARTS_WITH', 'STR_CONTAINS',
  'NUM_EQ', 'NUM_GT', 'NUM_GTE', 'NUM_LT', 'NUM_LTE',
  'DATE_AFTER', 'DATE_BEFORE',
  'SEMVER_EQ', 'SEMVER_GT', 'SEMVER_LT', 'SEMVER_GTE', 'SEMVER_LTE',
  'REGEX', 'IN_CIDR',
] as const;

const constraint = z.object({
  field: z.string().describe('Context field name, e.g. userId, email, appName'),
  operator: z.enum(operators),
  values: z.array(z.string()).min(1),
  inverted: z.boolean().optional(),
  caseInsensitive: z.boolean().optional(),
});

const value = z.object({
  name: z.string().describe('Variant name'),
  payload: z.object({ type: z.enum(['string', 'json', 'csv', 'number']), value: z.string() }).optional(),
});

const target = z.object({
  rollout: z.number().int().min(0).max(100).optional().describe('Percentage of the audience, default 100'),
  constraints: z.array(constraint).optional(),
  segments: z.array(z.string()).optional().describe('Segment names'),
  value: value.optional().describe('Value delivered to this audience as a strategy variant'),
});

const confirmations = ['createFlag'] as const;

export const releaseInput = {
  project: z.string().optional(),
  flag: z.string(),
  environment: z.string().optional(),
  targets: z.array(target).min(1).describe('Each target is one audience; targets are ORed'),
  confirm: z.array(z.enum(confirmations)).optional().describe('Confirmations given by the user, by decision id'),
};

export type ReleaseInput = z.infer<z.ZodObject<typeof releaseInput>>;
type Constraint = z.infer<typeof constraint>;
type Target = z.infer<typeof target>;

// ---------- decisions ----------

/** `choose`: fix the input and call again. `confirm`: call again with the id in `confirm`. */
export type Decision =
  | { kind: 'choose'; message: string; options: string[] }
  | { kind: 'confirm'; id: (typeof confirmations)[number]; message: string };

export type ReleaseResult =
  | { kind: 'decisions'; decisions: Decision[] }
  | { kind: 'failed'; error: string; applied: string[] }
  | { kind: 'released'; flag: string; environment: string; strategies: string[] }
  | { kind: 'pending_change_request'; flag: string; environment: string; changeRequest: { id: number; state: string }; strategies: string[] };

// ---------- flow ----------

class UnleashError extends Error {
  constructor(what: string, status: number, body: unknown) {
    const detail = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : JSON.stringify(body);
    super(`${what} (HTTP ${status}): ${detail}`);
  }
}

/** Data of a successful response; otherwise an UnleashError naming what was attempted. */
const unwrap = <T>(what: string, r: { data?: T; error?: unknown; response: Response }): T => {
  if (r.error !== undefined || !r.response.ok) throw new UnleashError(what, r.response.status, r.error);
  return r.data as T;
};

type FeatureEnvironment = { enabled: boolean; strategies: { id: string }[] };

export const release = async (unleash: UnleashClient, input: ReleaseInput): Promise<ReleaseResult> => {
  const applied: string[] = [];
  try {
    return await run(unleash, input, applied);
  } catch (e) {
    if (e instanceof UnleashError) return { kind: 'failed', error: e.message, applied };
    throw e;
  }
};

/** `applied` records each completed write, so a failure can report what already happened. */
const run = async (unleash: UnleashClient, input: ReleaseInput, applied: string[]): Promise<ReleaseResult> => {
  const decisions: Decision[] = [];
  const choose = (message: string, options: string[]): undefined => { decisions.push({ kind: 'choose', message, options }); };
  const { flag, targets } = input;

  const project = input.project ?? await pickProject(unleash, choose);
  if (!project) return { kind: 'decisions', decisions };

  // Everything below depends only on the project, so all their decisions are collected in one pass.
  const [environments, fields, allSegments] = await Promise.all([
    unwrap('read environments', await unleash.GET('/api/admin/environments/project/{projectId}', { params: { path: { projectId: project } } })).environments,
    targets.some((t) => t.constraints?.length) ? contextFields(unleash, project) : [],
    targets.some((t) => t.segments?.length) ? unwrap('read segments', await unleash.GET('/api/admin/segments')).segments ?? [] : [],
  ]);
  const environment = pickEnvironment(environments, project, input.environment, choose);
  const existing = environment ? await findOrCreateFeature(unleash, project, environment, flag, input.confirm ?? [], decisions, applied) : undefined;
  checkConstraints(fields, targets, choose);
  const segmentIds = resolveSegments(allSegments, project, targets, choose);
  if (decisions.length > 0 || !environment || !existing || !segmentIds) return { kind: 'decisions', decisions };

  const strategies = targets.map((t) => toStrategy(flag, t, segmentIds));
  const summary = strategies.map(describeStrategy);
  const changeRequests = unwrap('read change request config', await unleash.GET('/api/admin/projects/{projectId}/change-requests/config', { params: { path: { projectId: project } } }))
    .some((c) => c.environment === environment && c.changeRequestEnabled);

  // Pair existing strategies with targets by position: update, then add extras, then delete surplus (never zero strategies).
  const updates = strategies.slice(0, existing.strategies.length).map((s, i) => ({ id: existing.strategies[i]!.id, strategy: s }));
  const adds = strategies.slice(existing.strategies.length);
  const deletes = existing.strategies.slice(strategies.length);
  const path = { projectId: project, featureName: flag, environment };

  if (changeRequests) {
    const changes = [
      ...updates.map((u) => ({ feature: flag, action: 'updateStrategy' as const, payload: { id: u.id, ...u.strategy } })),
      ...adds.map((s) => ({ feature: flag, action: 'addStrategy' as const, payload: s })),
      ...deletes.map((s) => ({ feature: flag, action: 'deleteStrategy' as const, payload: { id: s.id } })),
      ...(existing.enabled ? [] : [{ feature: flag, action: 'updateEnabled' as const, payload: { enabled: true } }]),
    ];
    const cr = unwrap('open change request', await unleash.POST('/api/admin/projects/{projectId}/environments/{environment}/change-requests', {
      params: { path: { projectId: project, environment } },
      body: changes,
    }));
    return { kind: 'pending_change_request', flag, environment, changeRequest: { id: cr.id, state: cr.state }, strategies: summary };
  }

  const strategyPath = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies/{strategyId}';
  for (const u of updates) {
    unwrap(`update strategy "${u.strategy.title}"`, await unleash.PUT(strategyPath, { params: { path: { ...path, strategyId: u.id } }, body: u.strategy }));
    applied.push(`updated strategy "${u.strategy.title}"`);
  }
  for (const s of adds) {
    unwrap(`add strategy "${s.title}"`, await unleash.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies', { params: { path }, body: s }));
    applied.push(`added strategy "${s.title}"`);
  }
  for (const s of deletes) {
    unwrap('delete surplus strategy', await unleash.DELETE(strategyPath, { params: { path: { ...path, strategyId: s.id } } }));
    applied.push('deleted a surplus strategy');
  }
  if (!existing.enabled) {
    unwrap('enable environment', await unleash.POST('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on', { params: { path } }));
    applied.push('enabled the environment');
  }
  return { kind: 'released', flag, environment, strategies: summary };
};

// ---------- reads ----------

type Choose = (message: string, options: string[]) => undefined;

const pickProject = async (unleash: UnleashClient, choose: Choose): Promise<string | undefined> => {
  const projects = unwrap('read projects', await unleash.GET('/api/admin/projects')).projects;
  if (projects.length === 1) return projects[0]!.id;
  return choose('Which project?', projects.map((p) => p.id));
};

// The project endpoint returns only project-scoped fields; global ones come from the global endpoint.
const contextFields = async (unleash: UnleashClient, project: string) => [
  ...unwrap('read context fields', await unleash.GET('/api/admin/context')),
  ...unwrap('read project context fields', await unleash.GET('/api/admin/projects/{projectId}/context', { params: { path: { projectId: project } } })),
];

const findOrCreateFeature = async (
  unleash: UnleashClient, project: string, environment: string, flag: string, confirmed: readonly string[], decisions: Decision[], applied: string[],
): Promise<FeatureEnvironment | undefined> => {
  const r = await unleash.GET('/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}', {
    params: { path: { projectId: project, featureName: flag, environment } },
  });
  if (r.response.status !== 404) {
    const fe = unwrap('read flag', r);
    return { enabled: fe.enabled, strategies: (fe.strategies ?? []).flatMap((s) => (s.id ? [{ id: s.id }] : [])) };
  }
  if (!confirmed.includes('createFlag')) {
    decisions.push({ kind: 'confirm', id: 'createFlag', message: `Flag "${flag}" does not exist in project ${project}. Create it?` });
    return undefined;
  }
  unwrap(`create flag "${flag}"`, await unleash.POST('/api/admin/projects/{projectId}/features', { params: { path: { projectId: project } }, body: { name: flag, type: 'release' } }));
  applied.push(`created flag "${flag}"`);
  return { enabled: false, strategies: [] };
};

// ---------- checks (pure) ----------

type Environment = { name: string; enabled: boolean };
type ContextField = { name: string; legalValues?: { value: string }[] };
type Segment = { id: number; name: string; project?: string | null };

export const pickEnvironment = (environments: Environment[], project: string, wanted: string | undefined, choose: Choose): string | undefined => {
  const names = environments.filter((e) => e.enabled).map((e) => e.name);
  if (wanted && names.includes(wanted)) return wanted;
  return choose(wanted ? `Environment "${wanted}" not found in project ${project}. Which one?` : 'Which environment?', names);
};

export const checkConstraints = (fields: ContextField[], targets: Target[], choose: Choose): void => {
  const seen = new Set<string>();
  const once = (key: string, message: string, options: string[]) => { if (!seen.has(key)) { seen.add(key); choose(message, options); } };
  for (const c of targets.flatMap((t) => t.constraints ?? [])) {
    const field = fields.find((f) => f.name === c.field);
    if (!field) { once(c.field, `Unknown context field "${c.field}". Use one of:`, fields.map((f) => f.name)); continue; }
    const legal = field.legalValues?.map((l) => l.value) ?? [];
    if (legal.length === 0) continue;
    for (const v of c.values.filter((v) => !legal.includes(v))) {
      once(`${c.field}:${v}`, `"${v}" is not among the legal values of ${c.field}. Pick one, or add it with the context field tool first:`, legal);
    }
  }
};

export const resolveSegments = (segments: Segment[], project: string, targets: Target[], choose: Choose): Map<string, Segment> | undefined => {
  const visible = segments.filter((s) => !s.project || s.project === project);
  const found = new Map<string, Segment>();
  let missing = false;
  for (const name of new Set(targets.flatMap((t) => t.segments ?? []))) {
    const segment = visible.find((s) => s.name === name);
    if (segment) found.set(name, segment);
    else { missing = true; choose(`Segment "${name}" not found. Pick an existing one, or create it with the segments tool first:`, visible.map((s) => s.name)); }
  }
  return missing ? undefined : found;
};

// ---------- mapping ----------

const toApiConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});

const toStrategy = (flag: string, t: Target, segments: Map<string, Segment>) => ({
  name: 'flexibleRollout',
  title: describeTarget(t),
  parameters: { rollout: String(t.rollout ?? 100), stickiness: 'default', groupId: flag },
  constraints: (t.constraints ?? []).map(toApiConstraint),
  segments: (t.segments ?? []).map((n) => segments.get(n)!.id),
  variants: t.value
    ? [{ name: t.value.name, weight: 1000, weightType: 'variable' as const, stickiness: 'default', payload: t.value.payload }]
    : [],
});

const describeTarget = (t: Target): string => {
  const parts = [`${t.rollout ?? 100}%`];
  if (t.constraints?.length) parts.push(t.constraints.map((c) => `${c.field} ${c.operator} ${c.values.join(',')}`).join(' and '));
  if (t.segments?.length) parts.push(`segments ${t.segments.join(',')}`);
  if (t.value) parts.push(`value ${t.value.name}`);
  return parts.join(' | ');
};

const describeStrategy = (s: ReturnType<typeof toStrategy>): string => `- ${s.title}`;
