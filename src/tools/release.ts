import type { UnleashClient } from '../unleash/client.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';

const projects = '/api/admin/projects';
const features = '/api/admin/projects/{projectId}/features';
const feature = '/api/admin/projects/{projectId}/features/{featureName}';
const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

type FlagStatus = Extract<ReleaseResult, { kind: 'released' }>['flag']['status'];
type Failed = Extract<ReleaseResult, { kind: 'failed' }>;
type Confirm = Extract<ReleaseResult, { kind: 'confirm' }>;
type Choose = Extract<ReleaseResult, { kind: 'choose' }>;
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
    const added = await unleash.POST(strategies, {
      params: { path },
      body: {
        name: 'flexibleRollout',
        parameters: { rollout: String(input.rollout), stickiness: 'default', groupId: input.flag },
      },
    });
    if (!added.response.ok) return failed(added);

    const enabled = await unleash.POST(enable, { params: { path } });
    if (!enabled.response.ok) return failed(enabled);

    return {
      kind: 'released',
      flag: { status, name: input.flag },
      environment: input.environment,
      rollout: input.rollout,
    };
  };

// With a single project there is nothing to choose, so it is used without asking.
const pickProject = async (unleash: UnleashClient, input: ReleaseInput): Promise<string | Failed | Choose> => {
  if (input.project) return input.project;

  const listed = await unleash.GET(projects);
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

const failed = ({ response, error }: FailedCall): Failed => ({
  kind: 'failed',
  status: response.status,
  name: error?.name ?? 'UnknownError',
  reasons: error?.details?.map((d) => d.message) ?? [],
});
