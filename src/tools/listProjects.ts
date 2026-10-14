import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import { readProjectsResource } from '../resources/unleashResources.js';
import type { UnleashProjectSummary } from '../unleash/client.js';
import { jsonResult } from '../utils/toolResult.js';

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
    .describe(
      'Number of projects to skip (default: 0). To get the next page, pass the nextOffset from the previous response; no nextOffset means this was the last page.',
    ),
});

type ListProjectsInput = z.infer<typeof listProjectsSchema>;

interface ProjectsEnvelope {
  fetchedAt: string;
  cached: boolean;
  dryRun: boolean;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
  nextOffset?: number;
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

    context.logger.info(`Listed ${envelope.projects.length}/${envelope.totalProjects} project(s)`);

    return jsonResult({ success: true, ...envelope });
  } catch (error) {
    return handleToolError(context, error, 'list_projects');
  }
}

export const listProjectsTool = {
  name: 'list_projects',
  title: 'List Unleash projects',
  annotations: { readOnlyHint: true },
  description:
    'List Unleash projects available to the configured token, with optional pagination. Use this for discovery before scoping flag operations to a specific project. Returns project id, name, description, creation time, and URL.',
  inputSchema: listProjectsSchema,
  implementation: listProjects,
};
