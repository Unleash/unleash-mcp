import type { UnleashClient } from '../unleash/client.ts';
import type { Constraint, ReleaseInput, Target } from './releaseInput.ts';
import type { Choose, Confirm, Failed, ReleaseResult } from './releaseOutput.ts';

const projects = '/api/admin/projects';
const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';
const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

type FlagStatus = "new" | "existing";
// Unleash puts the useful error messages in `details`, which the OpenAPI spec omits.
type UnleashError = { name?: string; details?: { message: string }[] };
type FailedCall = { response: Response; error?: UnleashError };

export const createRelease =
  (unleash: UnleashClient) =>
    async (input: ReleaseInput): Promise<ReleaseResult> => {
      const project = await pickProject(unleash, input);
      if (typeof project !== 'string') return project;

      const status = await ensureFlag(unleash, project, input);
      if (typeof status !== 'string') return status;

      const path = { projectId: project, featureName: input.flag, environment: input.environment };
      for (const target of input.targets) {
        const added = await unleash.POST(strategies, { params: { path }, body: toStrategy(input.flag, target) });
        if (!added.response.ok) return failed(added);
      }

      const enabled = await unleash.POST(enable, { params: { path } });
      if (!enabled.response.ok) return failed(enabled);

      return {
        kind: 'released',
        flag: { status, name: input.flag },
        environment: input.environment,
        targets: input.targets.map((t) => ({ ...t, rollout: rolloutOf(t) })),
      };
    };

// With a single project there is nothing to choose, so it is used without asking.
const pickProject = async (unleash: UnleashClient, input: ReleaseInput): Promise<string | Failed | Choose> => {
  if (input.project) return input.project;

  const listed = await unleash.GET(projects, { params: { query: { view: 'core' } } });
  if (!listed.response.ok || !listed.data) return failed(listed);
  const ids = listed.data.projects.map((p) => p.id);
  if (ids.length === 1) return ids[0]!;
  return { kind: 'choose', input: 'project', message: 'Which project?', options: ids };
};

const ensureFlag = async (unleash: UnleashClient, project: string, input: ReleaseInput): Promise<FlagStatus | Failed | Confirm> => {
  const found = await unleash.GET(feature, { params: { path: { projectId: project, featureName: input.flag } } });
  if (found.response.ok) return 'existing';
  if (found.response.status !== 404) return failed(found);
  if (!input.createFlag) {
    return { kind: 'confirm', input: 'createFlag', message: `Flag "${input.flag}" does not exist in project ${project}. Create it?` };
  }

  const created = await unleash.POST(features, { params: { path: { projectId: project } }, body: { name: input.flag } });
  if (!created.response.ok) return failed(created);
  return 'new';
};

const rolloutOf = (target: Target): number => target.rollout ?? 100;

const toStrategy = (flag: string, target: Target) => ({
  name: 'flexibleRollout',
  title: target.name,
  parameters: { rollout: String(rolloutOf(target)), stickiness: 'default', groupId: flag },
  constraints: (target.constraints ?? []).map(toConstraint),
  // Unleash rejects a lone variant with a fixed weight, so it takes all of the variable weight.
  variants: target.value ? [{ ...target.value, weight: 1000, weightType: 'variable' as const, stickiness: 'default' }] : [],
});

const toConstraint = (c: Constraint) => ({
  contextName: c.field,
  operator: c.operator,
  values: c.values,
  inverted: c.inverted ?? false,
  caseInsensitive: c.caseInsensitive ?? false,
});

const failed = ({ response, error }: FailedCall): Failed => ({
  kind: 'failed',
  status: response.status,
  name: error?.name ?? 'UnknownError',
  reasons: error?.details?.map((d) => d.message) ?? [],
});
