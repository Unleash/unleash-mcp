import type { UnleashClient } from '../unleash/client.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseResult } from './releaseOutput.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

export const createRelease =
  (unleash: UnleashClient) =>
  async (input: ReleaseInput): Promise<ReleaseResult> => {
    const path = { projectId: input.project, featureName: input.flag, environment: input.environment };
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

    return { kind: 'released', flag: input.flag, environment: input.environment, rollout: input.rollout };
  };

// Unleash puts the useful error messages in `details`, which the OpenAPI spec omits.
type UnleashError = { name?: string; details?: { message: string }[] };
type FailedCall = { response: Response; error?: UnleashError };

const failed = ({ response, error }: FailedCall): ReleaseResult => ({
  kind: 'failed',
  status: response.status,
  name: error?.name ?? 'UnknownError',
  reasons: error?.details?.map((d) => d.message) ?? [],
});
