import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { readProjectsResource } from '../resources/unleashResources.js';
import type { UnleashProjectSummary } from '../unleash/client.js';

const listProjectsSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Maximum number of projects to return per page (default: server page size, typically 20)',
    ),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .describe('Sort order by project creation time (default: desc, newest first)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of projects to skip for pagination (default: 0)'),
});

type ListProjectsInput = z.infer<typeof listProjectsSchema>;

interface ProjectsEnvelope {
  fetchedAt: string;
  cached: boolean;
  dryRun: boolean;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
  nextOffset: number | null;
  totalProjects: number;
  projects: UnleashProjectSummary[];
}

export async function listProjects(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: ListProjectsInput = listProjectsSchema.parse(args);

    await context.notifyProgress(progressToken, 0, 100, 'Listing Unleash projects...');

    const resource = await readProjectsResource(context, {
      limit: input.limit,
      order: input.order,
      offset: input.offset,
    });
    const envelope = JSON.parse(resource.text) as ProjectsEnvelope;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Listed ${envelope.projects.length} of ${envelope.totalProjects} project${envelope.totalProjects === 1 ? '' : 's'}`,
    );

    const paginationHint =
      envelope.nextOffset != null
        ? `, nextOffset=${envelope.nextOffset} (call again with offset=${envelope.nextOffset} for the next page)`
        : '';

    const projectLines =
      envelope.projects.length > 0
        ? envelope.projects.map((p) => {
            const nameSuffix = p.name && p.name !== p.id ? ` (${p.name})` : '';
            const descriptionSuffix = p.description ? ` — ${p.description}` : '';
            return `- ${p.id}${nameSuffix}${descriptionSuffix}`;
          })
        : ['- No projects found. Create a project in Unleash first.'];

    const summaryText = [
      `${envelope.totalProjects} project${envelope.totalProjects === 1 ? '' : 's'} total.`,
      `Showing ${envelope.projects.length}; order=${envelope.order}, offset=${envelope.offset}${paginationHint}.`,
      '',
      'Projects:',
      ...projectLines,
    ].join('\n');

    context.logger.info(`Listed ${envelope.projects.length}/${envelope.totalProjects} project(s)`);

    return {
      content: [
        {
          type: 'text',
          text: summaryText,
        },
        {
          type: 'resource_link',
          name: 'unleash-projects',
          uri: resource.uri,
          mimeType: resource.mimeType ?? 'application/json',
          title: 'Unleash projects',
        },
      ],
      structuredContent: {
        success: true,
        ...envelope,
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'list_projects');
  }
}

export const listProjectsTool = {
  name: 'list_projects',
  description:
    'List Unleash projects available to the configured token, with optional pagination. Use this for discovery before scoping flag operations to a specific project. Returns project id, name, description, mode, creation time, and URL.',
  inputSchema: listProjectsSchema,
  implementation: listProjects,
};
