import type { UnleashClient } from '../unleash/client.ts';
import type { ReleaseInput } from './releaseInput.ts';
import type { ReleaseOutput } from './releaseOutput.ts';

const strategies = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/strategies';
const enable = '/api/admin/projects/{projectId}/features/{featureName}/environments/{environment}/on';

export const createRelease =
  (unleash: UnleashClient) =>
  async (input: ReleaseInput): Promise<ReleaseOutput> => {
    const path = { projectId: input.project, featureName: input.flag, environment: input.environment };

    const added = await unleash.POST(strategies, {
      params: { path },
      body: {
        name: 'flexibleRollout',
        parameters: { rollout: String(input.rollout), stickiness: 'default', groupId: input.flag },
      },
    });
    if (added.error) throw new Error(`add strategy failed (HTTP ${added.response.status})`);

    const enabled = await unleash.POST(enable, { params: { path } });
    if (enabled.error) throw new Error(`enable environment failed (HTTP ${enabled.response.status})`);

    return { kind: 'released', flag: input.flag, environment: input.environment, rollout: input.rollout };
  };
