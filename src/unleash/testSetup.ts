import type { UnleashClient } from './client.ts';

// Setup and teardown that recorded tests do as an admin, so they recreate what they need and
// leave nothing behind. Over time these should go through the server's own tools.

// Removes the flag for good: archiving and then deleting from the archive. A flag with children
// cannot be deleted, so their dependencies on it go first.
export const deleteFlag = async (admin: UnleashClient, projectId: string, featureName: string): Promise<void> => {
  const found = await admin.GET('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId, featureName } },
  });
  for (const child of found.data?.children ?? []) {
    await admin.DELETE('/api/admin/projects/{projectId}/features/{child}/dependencies/{parent}', {
      params: { path: { projectId, child, parent: featureName } },
    });
  }
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', {
    params: { path: { projectId, featureName } },
  });
  await admin.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName } } });
};

/**
 * Deletes release templates by name. A failed recording can leave one behind, and Unleash refuses a second
 * one with the same name. A project template only shows in its project's list, so pass the project to delete one.
 */
export const deleteReleaseTemplate = async (admin: UnleashClient, name: string, projectId?: string): Promise<void> => {
  const listed = projectId
    ? await admin.GET('/api/admin/projects/{projectId}/release-templates', { params: { path: { projectId } } })
    : await admin.GET('/api/admin/release-plan-templates');
  for (const template of (listed.data ?? []).filter((t) => t.name === name)) {
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
  const listed = await admin.GET('/api/admin/segments');
  for (const segment of (listed.data?.segments ?? []).filter((s) => s.name === name)) {
    await admin.DELETE('/api/admin/segments/{id}', { params: { path: { id: segment.id } } });
  }
};

// A submitted change request can't be deleted, only cancelled, and only by its author, the user under test.
export const cancelChangeRequest = async (author: UnleashClient, projectId: string, id: number): Promise<void> => {
  // The OpenAPI spec omits the body.
  await author.PUT('/api/admin/projects/{projectId}/change-requests/{id}/state', {
    params: { path: { projectId, id: String(id) } },
    body: { state: 'Cancelled' } as never,
  });
};

/** Deletes projects by name. Unleash picks a created project's id, so a failed recording leaves one only its name tells apart. */
export const deleteProjectNamed = async (admin: UnleashClient, name: string): Promise<void> => {
  const listed = await admin.GET('/api/admin/projects', { params: { query: { view: 'core' } } });
  for (const project of (listed.data?.projects ?? []).filter((p) => p.name === name)) {
    await admin.DELETE('/api/admin/projects/{projectId}', { params: { path: { projectId: project.id } } });
  }
};
