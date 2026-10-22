import type { UnleashClient } from './client.ts';

// Setup and teardown that recorded tests do as an admin, so they recreate what they need and
// leave nothing behind. Over time these should go through the server's own tools.

// Removes the flag for good: archiving and then deleting from the archive. A flag with children
// cannot be deleted, so their dependencies on it go first.
export const deleteFlag = async (admin: UnleashClient, projectId: string, featureName: string): Promise<void> => {
  const found = await admin.GET('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId, featureName } } });
  for (const child of found.data?.children ?? []) {
    await admin.DELETE('/api/admin/projects/{projectId}/features/{child}/dependencies/{parent}', { params: { path: { projectId, child, parent: featureName } } });
  }
  await admin.DELETE('/api/admin/projects/{projectId}/features/{featureName}', { params: { path: { projectId, featureName } } });
  await admin.DELETE('/api/admin/archive/{featureName}', { params: { path: { featureName } } });
};
