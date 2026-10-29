import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import type { ProjectQuery } from '../inspectInput.ts';
import type { Project } from '../inspectOutput.ts';

// The project overview is what the Unleash UI reads for a project's environments. The environments-by-project
// endpoint instead lists every environment of the instance and answers an unknown project with an empty list.
export const inspectProject = async (unleash: UnleashClient, { project }: ProjectQuery): Promise<Project | Failed> => {
  const found = await unleash.GET('/api/admin/projects/{projectId}/overview', {
    params: { path: { projectId: project } },
  });
  if (!found.response.ok || !found.data) return toFailed(found);
  const { name, description, mode, featureNaming: naming } = found.data;
  return {
    kind: 'project',
    name,
    ...(description ? { description } : {}),
    mode: mode ?? 'open',
    environments: (found.data.environments ?? []).map((e) => e.environment),
    defaultStickiness: found.data.defaultStickiness ?? 'default',
    ...(naming?.pattern ? { flagNaming: toFlagNaming(naming.pattern, naming) } : {}),
  };
};

const toFlagNaming = (
  pattern: string,
  { example, description }: { example?: string | null; description?: string | null },
): Project['flagNaming'] => ({
  pattern,
  ...(example ? { example } : {}),
  ...(description ? { description } : {}),
});
