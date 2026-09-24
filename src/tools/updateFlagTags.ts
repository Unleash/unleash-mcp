import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
} from '../context.js';
import { CustomError } from '../utils/errors.js';
import { createFlagResourceLink } from '../utils/streaming.js';
import { flagTagSchema, formatTags } from './tagSchemas.js';

const updateFlagTagsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  addTags: z
    .array(flagTagSchema)
    .optional()
    .describe('Tags to attach to the flag, e.g. [{ "type": "simple", "value": "squad-checkout" }]'),
  removeTags: z
    .array(flagTagSchema)
    .optional()
    .describe('Tags to detach from the flag. Only the tags listed here are removed.'),
});

type UpdateFlagTagsInput = z.infer<typeof updateFlagTagsSchema>;

export async function updateFlagTags(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: UpdateFlagTagsInput = updateFlagTagsSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    const addedTags = input.addTags ?? [];
    const removedTags = input.removeTags ?? [];

    if (addedTags.length === 0 && removedTags.length === 0) {
      throw new CustomError(
        'VALIDATION_ERROR',
        'No tag changes were requested',
        'Provide at least one tag in addTags or removeTags.',
      );
    }

    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${mode}Updating tags on "${input.featureName}"...`,
    );

    const tags = await context.unleashClient.updateFeatureTags(input.featureName, {
      addedTags,
      removedTags,
    });

    await context.notifyProgress(progressToken, 100, 100, `${mode}Tags updated`);

    const { url, resource } = createFlagResourceLink(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );

    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/features/${encodeURIComponent(
      input.featureName,
    )}/tags`;

    const changes = [
      addedTags.length > 0 ? `added ${formatTags(addedTags)}` : undefined,
      removedTags.length > 0 ? `removed ${formatTags(removedTags)}` : undefined,
    ]
      .filter((change): change is string => Boolean(change))
      .join('; ');

    const message = `${mode}Updated tags on "${input.featureName}" (${changes}).`;
    const currentTags = tags.length > 0 ? formatTags(tags) : 'none';

    context.logger.info(message);

    return {
      content: [
        {
          type: 'text',
          text: `${message}\nTags: ${currentTags}\nView feature: ${url}\nAdmin API: ${apiUrl}`,
        },
        {
          type: 'resource_link',
          name: input.featureName,
          uri: resource.uri,
          mimeType: resource.mimeType,
          title: resource.text,
        },
      ],
      structuredContent: {
        success: true,
        dryRun: context.config.server.dryRun,
        projectId,
        featureName: input.featureName,
        addedTags,
        removedTags,
        tags,
        links: {
          ui: url,
          api: apiUrl,
          resourceUri: resource.uri,
        },
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'update_flag_tags');
  }
}

export const updateFlagTagsTool = {
  name: 'update_flag_tags',
  title: 'Update flag tags',
  annotations: { readOnlyHint: false, destructiveHint: false },
  description: `Add or remove tags on an existing feature flag.

Use this when a flag already exists and needs ownership or governance tags — create_flag only sets tags at creation time. Only the tags listed in \`removeTags\` are detached; tags you do not mention are left alone.

The tag type must already exist in Unleash. Use get_flag_state to see a flag's current tags.`,
  inputSchema: updateFlagTagsSchema,
  implementation: updateFlagTags,
};
