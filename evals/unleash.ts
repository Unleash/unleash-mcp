import assert from 'node:assert/strict';
import { userInfo } from 'node:os';
import { z } from 'zod';
import { readConfig } from '../src/config.ts';
import { createProject, updateProject } from '../src/tools/configure/project.ts';
import type { components } from '../src/unleash/api.d.ts';
import { createUnleashClient, type UnleashClient } from '../src/unleash/client.ts';
import { applied, deleteProject } from '../src/unleash/testSetup.ts';

type Feature = components['schemas']['featureSchema'];
type ProjectFeature = components['schemas']['projectFeatureSchema'];

// Like a recorded test, an eval sets up as an admin while the agent writes as the user under test. It goes to the live
// sandbox, since nothing can replay what the agent decides to call.
const config = readConfig(process.env);
const adminPat = z.object({ UNLEASH_ADMIN_PAT: z.string().min(1) }).parse(process.env).UNLEASH_ADMIN_PAT;
const client = (token: string): UnleashClient =>
  createUnleashClient({ baseUrl: config.UNLEASH_BASE_URL, headers: { Authorization: token }, fetch: globalThis.fetch });
const unleash = client(config.UNLEASH_PAT);
export const admin = client(adminPat);

// Names end in the developer's username so that two machines never share a project. Flag names are unique across the
// instance, so a flag the eval names carries it too, and a prompt names every flag rather than leave it to the agent.
// Unleash derives a project's id from its name as a slug: single hyphens, none at either end.
const usernameSlug = userInfo()
  .username.toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, '-')
  .replaceAll(/^-|-$/g, '');
export const evalName = (name: string): string => `eval-${name}-${usernameSlug}`;

/** A fresh project for an eval, in place of what an earlier run left of it, with change requests off so the agent's writes land. */
export const createEvalProject = async (name: string): Promise<void> => {
  await deleteProject(admin, unleash, name);
  const created = applied(
    await createProject(unleash, {
      kind: 'project',
      action: 'create',
      name,
      environments: ['development', 'production'],
    }),
  );
  assert.equal(created.id, name);
  // An instance can require change requests in every new project's environment.
  applied(
    await updateProject(admin, {
      kind: 'project',
      action: 'update',
      id: name,
      name,
      changeRequestEnvironments: [
        { name: 'development', enabled: false },
        { name: 'production', enabled: false },
      ],
    }),
  );
};

// What the agent did is read straight from the Admin API, never through the server's own tools, which are what is under test.
export const readFlag = async (project: string, flag: string): Promise<Feature> => {
  const { data, response } = await admin.GET('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  assert.ok(data, `reading ${flag}: ${response.status}`);
  return data;
};

export const readFlags = async (project: string): Promise<ProjectFeature[]> => {
  const { data, response } = await admin.GET('/api/admin/projects/{projectId}/features', {
    params: { path: { projectId: project } },
  });
  assert.ok(data, `listing ${project}: ${response.status}`);
  // The listing comes back in no fixed order.
  return data.features.toSorted((a, b) => a.name.localeCompare(b.name));
};
