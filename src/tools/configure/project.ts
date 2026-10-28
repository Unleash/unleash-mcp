import type { UnleashClient } from '../../unleash/client.ts';
import { toFailed } from '../shared/failed.ts';
import type { CreateProject } from './configureInput.ts';
import type { Outcome } from './configureOutput.ts';

/** Creates a project, answering with the id Unleash picks for it so later changes can refer to it. */
export const createProject = async (
  unleash: UnleashClient,
  { name, description, mode, defaultStickiness, environments, changeRequestEnvironments }: CreateProject,
): Promise<Outcome> => {
  // The spec makes the settings Unleash defaults required, so a left out one is sent as that default.
  const created = await unleash.POST('/api/admin/projects', {
    body: {
      name,
      description,
      mode: mode ?? 'open',
      defaultStickiness: defaultStickiness ?? 'default',
      environments,
      changeRequestEnvironments: changeRequestEnvironments?.map((e) => ({
        name: e.name,
        requiredApprovals: e.requiredApprovals ?? 1,
      })),
    },
  });
  if (!created.response.ok || !created.data) return toFailed(created);
  return { kind: 'applied', id: created.data.id };
};
