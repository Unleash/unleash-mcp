import type { UnleashClient } from '../../unleash/client.ts';
import { type Failed, toFailed } from '../shared/failed.ts';
import type { CreateProject, UpdateProject } from './configureInput.ts';
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

/**
 * Changes a project, leaving out what the change leaves out. Environments are diffed against the enabled ones, so only
 * the differences are written; change request environments are set one by one. Stops at the first refused write.
 */
export const updateProject = async (
  unleash: UnleashClient,
  { id, name, description, mode, defaultStickiness, environments, changeRequestEnvironments }: UpdateProject,
): Promise<Outcome> => {
  const path = { projectId: id };
  const updated = await unleash.PUT('/api/admin/projects/{projectId}', {
    params: { path },
    body: { name, description, mode, defaultStickiness },
  });
  if (!updated.response.ok) return toFailed(updated);

  if (environments) {
    const refused = await setEnvironments(unleash, id, environments);
    if (refused) return refused;
  }

  for (const { name: environment, enabled, requiredApprovals } of changeRequestEnvironments ?? []) {
    const configured = await unleash.PUT(
      '/api/admin/projects/{projectId}/environments/{environment}/change-requests/config',
      {
        params: { path: { ...path, environment } },
        body: { changeRequestsEnabled: enabled, ...(enabled ? { requiredApprovals: requiredApprovals ?? 1 } : {}) },
      },
    );
    if (!configured.response.ok) return toFailed(configured);
  }
  return { kind: 'applied' };
};

// The project overview is where inspect reads the enabled environments too.
const setEnvironments = async (
  unleash: UnleashClient,
  projectId: string,
  environments: string[],
): Promise<Failed | undefined> => {
  const found = await unleash.GET('/api/admin/projects/{projectId}/overview', { params: { path: { projectId } } });
  if (!found.response.ok || !found.data) return toFailed(found);
  const current = (found.data.environments ?? []).map((e) => e.environment);

  for (const environment of environments.filter((e) => !current.includes(e))) {
    const added = await unleash.POST('/api/admin/projects/{projectId}/environments', {
      params: { path: { projectId } },
      body: { environment },
    });
    if (!added.response.ok) return toFailed(added);
  }
  for (const environment of current.filter((e) => !environments.includes(e))) {
    const removed = await unleash.DELETE('/api/admin/projects/{projectId}/environments/{environment}', {
      params: { path: { projectId, environment } },
    });
    if (!removed.response.ok) return toFailed(removed);
  }
  return undefined;
};
