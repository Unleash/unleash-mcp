import type {
  Resource,
  ResourceTemplate,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

import type { ServerContext } from '../context.js';

export const PROJECTS_RESOURCE_URI = 'unleash://projects';
export const FEATURE_FLAGS_RESOURCE_TEMPLATE =
  'unleash://projects/{projectId}/feature-flags';

export function listStaticResources(): Resource[] {
  const resources: Resource[] = [
    {
      name: 'unleash-projects',
      uri: PROJECTS_RESOURCE_URI,
      mimeType: 'application/json',
      description:
        'Current Unleash projects with their names and descriptions. Use to choose an appropriate project instead of the default.',
    },
  ];

  return resources;
}

export function listResourceTemplates(): ResourceTemplate[] {
  return [
    {
      name: 'unleash-feature-flags-by-project',
      uriTemplate: FEATURE_FLAGS_RESOURCE_TEMPLATE,
      mimeType: 'application/json',
      description:
        'Feature flags for a specific Unleash project. Replace {projectId} to inspect existing flags before creating new ones.',
    },
  ];
}

export async function readProjectsResource(
  context: ServerContext
): Promise<TextResourceContents> {
  try {
    const projects = await context.unleashClient.listProjects();

    const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

    return {
      uri: PROJECTS_RESOURCE_URI,
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          dryRun: context.config.server.dryRun,
          projects: sorted,
        },
        null,
        2
      ),
    };
  } catch (error) {
    context.logger.error('Failed to read Unleash projects resource', error);
    throw error;
  }
}

export async function readFeatureFlagsResource(
  context: ServerContext,
  projectId: string
): Promise<TextResourceContents> {
  try {
    const flags = await context.unleashClient.listFeatureFlags(projectId);

    const sorted = [...flags].sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    return {
      uri: buildFeatureFlagsUri(projectId),
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          dryRun: context.config.server.dryRun,
          projectId,
          flags: sorted,
        },
        null,
        2
      ),
    };
  } catch (error) {
    context.logger.error('Failed to read Unleash feature flags resource', error);
    throw error;
  }
}

export function isFeatureFlagsUri(uri: string): boolean {
  return /^unleash:\/\/projects\/[^/]+\/feature-flags$/.test(uri);
}

export function extractProjectIdFromFeatureUri(uri: string): string | undefined {
  const match = uri.match(/^unleash:\/\/projects\/([^/]+)\/feature-flags$/);
  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildFeatureFlagsUri(projectId: string): string {
  return `unleash://projects/${encodeURIComponent(projectId)}/feature-flags`;
}
