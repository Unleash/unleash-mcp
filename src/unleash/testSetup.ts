import assert from 'node:assert/strict';
import { createProject, updateProject } from '../tools/configure/project.ts';
import { deleteSegment } from '../tools/configure/segment.ts';
import { archiveFlag } from '../tools/manageFlag/archive.ts';
import { defineFlag } from '../tools/manageFlag/define.ts';
import { deleteArchivedFlag } from '../tools/manageFlag/delete.ts';
import type { Define } from '../tools/manageFlag/manageFlagInput.ts';
import { setParentDependency } from '../tools/manageFlag/setParentDependency.ts';
import { searchFlags } from '../tools/search/flags/flags.ts';
import { searchReleaseTemplates } from '../tools/search/releaseTemplates/releaseTemplates.ts';
import { searchSegments } from '../tools/search/segments/segments.ts';
import type { ChangeRequestReader } from '../tools/shared/changeRequest.ts';
import type { UnleashClient } from './client.ts';

// Setup that recorded tests do as an admin, through the server's own tools; only what no tool does (deleting a project
// or a template, cancelling a change request, project membership) is done over the API. A test cleans up before, not
// after: what it made stays for a look when something went wrong, and the next recording starts over.

// A refused write fails in setup, with Unleash's answer, and not a few lines later with less to go on.
export const applied = <T extends { kind: string }>(outcome: T): Extract<T, { kind: 'applied' }> => {
  assert.equal(outcome.kind, 'applied', `setup expected applied: ${JSON.stringify(outcome)}`);
  return outcome as Extract<T, { kind: 'applied' }>;
};

export const released = <T extends { kind: string }>(outcome: T): Extract<T, { kind: 'released' }> => {
  assert.equal(outcome.kind, 'released', `setup expected released: ${JSON.stringify(outcome)}`);
  return outcome as Extract<T, { kind: 'released' }>;
};

// A flag an earlier recording left must not pass for the one the test defines, so an existing one fails.
export const createFlag = async (
  admin: UnleashClient,
  project: string,
  definition: Omit<Define, 'action' | 'project'>,
): Promise<void> => {
  const defined = applied(await defineFlag(admin, { action: 'define', project, ...definition }));
  assert.equal(defined.origin, 'created', `${definition.flag} was there before the test`);
};

/** For a tool that routes through change requests: a test project needs approval in production, and setup writes directly. */
export const withoutChangeRequests: ChangeRequestReader = async () => ({ kind: 'environments', environments: [] });

// Removes the flag for good: archiving and then deleting from the archive, whether or not it is there. A flag with
// children cannot be deleted, so their dependencies on it go first. The children are read over the API: an inspect
// of the flag costs several requests for that one field.
export const deleteFlag = async (admin: UnleashClient, project: string, flag: string): Promise<void> => {
  const found = await admin.GET('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId: project, featureName: flag } },
  });
  for (const child of found.data?.children ?? [])
    applied(
      await setParentDependency(admin, withoutChangeRequests, {
        action: 'set_parent_dependency',
        project,
        flag: child,
        parent: null,
      }),
    );
  await archiveFlag(admin, withoutChangeRequests, { action: 'archive', project, flag });
  await deleteArchivedFlag(admin, { action: 'delete', project, flag });
};

/**
 * Deletes release templates by name. A failed recording can leave one behind, and Unleash refuses a second
 * one with the same name. A project template only shows in its project's list, so pass the project to delete one.
 */
export const deleteReleaseTemplate = async (admin: UnleashClient, name: string, projectId?: string): Promise<void> => {
  const listed = await searchReleaseTemplates(admin, { kind: 'release_templates', project: projectId, query: name });
  assert(listed.kind === 'release_templates');
  for (const template of listed.templates.filter((t) => t.name === name)) {
    if (projectId)
      await admin.DELETE('/api/admin/projects/{projectId}/release-templates/{templateId}', {
        params: { path: { projectId, templateId: template.id } },
      });
    else
      await admin.DELETE('/api/admin/release-plan-templates/{templateId}', {
        params: { path: { templateId: template.id } },
      });
  }
};

// A failed recording can leave the segment behind, and Unleash refuses a second one with the same name.
export const deleteSegmentNamed = async (admin: UnleashClient, name: string): Promise<void> => {
  const listed = await searchSegments(admin, { kind: 'segments', query: name });
  assert(listed.kind === 'segments');
  for (const segment of listed.segments.filter((s) => s.name === name))
    applied(
      await deleteSegment(admin, withoutChangeRequests, {
        kind: 'segment',
        action: 'delete',
        id: segment.id,
        project: segment.project,
      }),
    );
};

// A submitted change request can't be deleted, only cancelled, and only by its author, the user under test.
export const cancelChangeRequest = async (author: UnleashClient, projectId: string, id: number): Promise<void> => {
  // The OpenAPI spec omits the body.
  await author.PUT('/api/admin/projects/{projectId}/change-requests/{id}/state', {
    params: { path: { projectId, id: String(id) } },
    body: { state: 'Cancelled' } as never,
  });
};

/**
 * Deletes a project with its flags: Unleash refuses to delete a project with active flags, and an archived one keeps its
 * name taken. Nothing is listed: Unleash derives a project's id from its name, and answers a missing project with success.
 */
export const deleteProject = async (admin: UnleashClient, author: UnleashClient, id: string): Promise<void> => {
  // A pending change request keeps its flag from being archived.
  const pending = await author.GET('/api/admin/projects/{projectId}/change-requests/pending', {
    params: { path: { projectId: id } },
  });
  for (const changeRequest of pending.data ?? []) await cancelChangeRequest(author, id, changeRequest.id);
  // Two searches: a flag has no lifecycle stage until shortly after its creation, so the stage filter would skip it.
  const live = await searchFlags(admin, { kind: 'flags', project: id, offset: 0, limit: 50 });
  const archived = await searchFlags(admin, { kind: 'flags', project: id, stages: ['archived'], offset: 0, limit: 50 });
  assert(live.kind === 'flags' && archived.kind === 'flags');
  for (const flag of [...live.flags, ...archived.flags]) await deleteFlag(admin, id, flag.name);
  const deleted = await admin.DELETE('/api/admin/projects/{projectId}', { params: { path: { projectId: id } } });
  assert(deleted.response.ok, `${id}: ${deleted.response.status}`);
};

/**
 * The test file's own project, with change requests required in production, so files share nothing and the sandbox
 * needs nothing set up. Unleash derives the id from the name, so the file can name it up front. The user under test
 * creates it and so owns it: a root Editor has no say in a project it is not in, and no tool adds members.
 */
export const createProjectNamed = async (admin: UnleashClient, unleash: UnleashClient, name: string): Promise<void> => {
  await deleteProject(admin, unleash, name);
  const created = applied(
    await createProject(unleash, {
      kind: 'project',
      action: 'create',
      name,
      environments: ['development', 'production'],
      changeRequestEnvironments: [{ name: 'production' }],
    }),
  );
  assert.equal(created.id, name);
  // An instance can require change requests in every new project's environment: only production keeps them.
  applied(
    await updateProject(admin, {
      kind: 'project',
      action: 'update',
      id: name,
      name,
      changeRequestEnvironments: [
        { name: 'development', enabled: false },
        { name: 'production', enabled: true },
      ],
    }),
  );
};
