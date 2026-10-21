import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askForProjectId,
  handleToolError,
  resolveProjectId,
  type ServerContext,
  toolErrorPayload,
} from '../context.js';
import type {
  ContextField,
  FeatureStrategy,
  FlexibleRolloutStrategy,
  ProjectSettings,
  SegmentSummary,
  StrategyConstraint,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { jsonResult } from '../utils/toolResult.js';
import { constraintSchema, shapeConstraint } from './constraints.js';
import { normalizeName, toVariants, variantSchema } from './setFlagRollout.js';

const defaultStrategySchema = z.strictObject({
  environment: z.string().min(1).describe('Environment name, such as "production"'),
  rolloutPercentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Percentage of users who get it, 100 when there is no default strategy yet'),
  segments: z
    .array(z.string().min(1))
    .optional()
    .describe('Names of the segments to target, as the user said them. [] removes them.'),
  constraints: z
    .array(constraintSchema)
    .optional()
    .describe('Conditions on context fields, such as devMode IN true. [] removes them.'),
  stickiness: z
    .string()
    .min(1)
    .optional()
    .describe("Context field that keeps a user in the same bucket; new ones use the project's"),
  groupId: z
    .string()
    .optional()
    .describe(
      'Bucketing group shared by every flag that gets this default, so they roll out to the same users. "" gives each flag its own group.',
    ),
  title: z.string().optional().describe('Descriptive title for the strategy'),
  variants: z.array(variantSchema).optional().describe('Strategy variants. [] removes them.'),
});

// No change request, mode or access settings: an agent must not switch off its own checks.
const updateProjectSettingsSchema = z
  .strictObject({
    projectId: z
      .string()
      .optional()
      .describe('Project ID (optional if UNLEASH_DEFAULT_PROJECT is set)'),
    defaultStickiness: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Context field that keeps a user in the same bucket, such as "sessionId". Needs Unleash Enterprise.',
      ),
    addEnvironments: z
      .array(z.string().min(1))
      .optional()
      .describe('Names of existing environments to make available in this project'),
    defaultStrategies: z
      .array(defaultStrategySchema)
      .optional()
      .describe(
        'Per environment, the strategy Unleash adds when a flag with no enabled strategies there is turned on',
      ),
  })
  .refine(
    (input) =>
      input.defaultStickiness || input.addEnvironments?.length || input.defaultStrategies?.length,
    { message: 'Pass at least one of defaultStickiness, addEnvironments or defaultStrategies.' },
  );

type DefaultStrategyInput = z.infer<typeof defaultStrategySchema>;
type DefaultStrategy = Omit<FeatureStrategy, 'id'>;

/** The settings part of the input, so an agent can pass what was not applied straight back. */
interface SettingsChange {
  addEnvironments?: string[];
  defaultStickiness?: string;
  defaultStrategies?: DefaultStrategyInput[];
}

interface Problem {
  environment?: string;
  code: string;
  message: string;
  hint: string;
  options?: unknown[];
}

interface Lookups {
  settings: ProjectSettings;
  environmentNames: string[];
  segments: SegmentSummary[];
  contextFields: ContextField[];
}

const summarize = (strategy: DefaultStrategy | undefined, segments: SegmentSummary[]) =>
  strategy && {
    ...(strategy.title && { title: strategy.title }),
    rolloutPercentage: Number(strategy.parameters?.rollout ?? 100),
    stickiness: strategy.parameters?.stickiness,
    groupId: strategy.parameters?.groupId,
    segments: (strategy.segments ?? []).map(
      (id) => segments.find((segment) => segment.id === id)?.name ?? `#${id}`,
    ),
    constraints: strategy.constraints ?? [],
    ...(strategy.variants?.length && { variants: strategy.variants }),
  };

function combine(changes: SettingsChange[]): SettingsChange {
  const addEnvironments = changes.flatMap((change) => change.addEnvironments ?? []);
  const defaultStickiness = changes.find((change) => change.defaultStickiness)?.defaultStickiness;
  const defaultStrategies = changes.flatMap((change) => change.defaultStrategies ?? []);
  return {
    ...(addEnvironments.length > 0 && { addEnvironments }),
    ...(defaultStickiness && { defaultStickiness }),
    ...(defaultStrategies.length > 0 && { defaultStrategies }),
  };
}

async function fetchSettings(context: ServerContext, projectId: string): Promise<ProjectSettings> {
  try {
    return await context.unleashClient.getProjectSettings(projectId);
  } catch (error) {
    if (error instanceof CustomError && error.code === 'HTTP_404') {
      throw new CustomError(
        error.code,
        `Project "${projectId}" not found.`,
        'Call list_projects to see which projects exist, and ask the user which one they mean.',
      );
    }
    throw error;
  }
}

async function loadLookups(
  context: ServerContext,
  projectId: string,
  change: SettingsChange,
): Promise<Lookups> {
  if (context.config.server.dryRun) return dryRunLookups(projectId, change);

  const { defaultStickiness, addEnvironments = [], defaultStrategies = [] } = change;
  const settings = await fetchSettings(context, projectId);
  const [environmentNames, segments, contextFields] = await Promise.all([
    addEnvironments.length > 0 ? context.unleashClient.listEnvironmentNames() : [],
    defaultStrategies.some((entry) => entry.segments?.length) ||
    settings.environments.some(({ defaultStrategy }) => defaultStrategy?.segments?.length)
      ? context.unleashClient.listSegments()
      : [],
    defaultStickiness ||
    defaultStrategies.some((entry) => entry.constraints?.length || entry.stickiness)
      ? context.unleashClient.getContextFields(projectId)
      : [],
  ]);
  return { settings, environmentNames, segments, contextFields };
}

/** Dry run calls no API, so every name in the request counts as found. */
function dryRunLookups(projectId: string, change: SettingsChange): Lookups {
  const { defaultStickiness, addEnvironments = [], defaultStrategies = [] } = change;
  const inProject = defaultStrategies
    .map(({ environment }) => environment)
    .filter((environment) => !addEnvironments.includes(environment));
  const segments = new Set(defaultStrategies.flatMap((entry) => entry.segments ?? []));
  const contextNames = new Set(
    [
      defaultStickiness,
      ...defaultStrategies.flatMap((entry) => [
        entry.stickiness,
        ...(entry.constraints ?? []).map(({ contextName }) => contextName),
      ]),
    ].filter((name) => name !== undefined),
  );
  return {
    settings: {
      name: projectId,
      defaultStickiness: 'default',
      environments: [...new Set(inProject)].map((environment) => ({ environment })),
    },
    environmentNames: addEnvironments,
    segments: [...segments].map((name, index) => ({ id: index + 1, name, project: null })),
    contextFields: [...contextNames].map((name) => ({ name, stickiness: true, legalValues: [] })),
  };
}

async function setDefaultStickiness(
  context: ServerContext,
  projectId: string,
  projectName: string,
  defaultStickiness: string,
): Promise<void> {
  try {
    await context.unleashClient.setProjectDefaultStickiness(
      projectId,
      projectName,
      defaultStickiness,
    );
  } catch (error) {
    // The project was fetched first, so a 404 means this Unleash has no such endpoint (open source).
    if (error instanceof CustomError && error.code === 'HTTP_404') {
      throw new CustomError(
        error.code,
        'Setting the default stickiness of a project needs Unleash Enterprise. This Unleash does not support it.',
        'Leave defaultStickiness out and call update_project_settings again for the rest.',
      );
    }
    throw error;
  }
}

async function buildDefaultStrategy(
  context: ServerContext,
  projectId: string,
  entry: DefaultStrategyInput,
  current: DefaultStrategy | undefined,
  lookups: Lookups,
  projectStickiness: string,
): Promise<{ strategy: FlexibleRolloutStrategy } | { problems: Problem[] }> {
  const { environment } = entry;
  const problems: Problem[] = [];
  const base = current?.name === 'flexibleRollout' ? current : undefined;
  const { contextFields } = lookups;
  const usable = lookups.segments.filter(
    (segment) => !segment.project || segment.project === projectId,
  );
  const segments: number[] = [];
  for (const name of entry.segments ?? []) {
    const loose = usable.filter((segment) => normalizeName(segment.name) === normalizeName(name));
    const match =
      usable.find((segment) => segment.name === name) ??
      (loose.length === 1 ? loose[0] : undefined);
    if (match) segments.push(match.id);
    else
      problems.push({
        environment,
        code: 'SEGMENT_NOT_FOUND',
        message: `No single segment in project "${projectId}" matches "${name}".`,
        hint: 'Ask the user which of these segments they mean, then pass its name.',
        options: (loose.length > 1 ? loose : usable).map((segment) => segment.name),
      });
  }

  const constraints: StrategyConstraint[] = [];
  for (const input of entry.constraints ?? []) {
    if (!contextFields.some(({ name }) => name === input.contextName)) {
      problems.push({
        environment,
        code: 'CONTEXT_FIELD_NOT_FOUND',
        message: `"${input.contextName}" is not a context field in project "${projectId}".`,
        hint: 'Ask the user which of these context fields they mean.',
        options: contextFields.map(({ name }) => name),
      });
      continue;
    }
    const shaped = shapeConstraint(input);
    if ('problem' in shaped) {
      problems.push({ environment, ...shaped.problem });
      continue;
    }
    try {
      await context.unleashClient.validateConstraint(shaped.constraint);
      constraints.push(shaped.constraint);
    } catch (error) {
      if (!(error instanceof CustomError && error.code === 'HTTP_400')) throw error;
      problems.push({
        environment,
        code: 'INVALID_CONSTRAINT',
        message: error.message,
        hint: 'Fix the constraint, or ask the user what they meant.',
      });
    }
  }

  if (problems.length > 0) return { problems };

  return {
    strategy: {
      title: entry.title ?? base?.title,
      disabled: base?.disabled,
      variants: entry.variants ? toVariants(entry.variants) : base?.variants,
      parameters: {
        // Unleash gives each flag its own group only when groupId is "", not when it is missing.
        groupId: '',
        ...base?.parameters,
        rollout: String(entry.rolloutPercentage ?? base?.parameters?.rollout ?? 100),
        stickiness: entry.stickiness ?? base?.parameters?.stickiness ?? projectStickiness,
        ...(entry.groupId !== undefined && { groupId: entry.groupId }),
      },
      constraints: entry.constraints ? constraints : (base?.constraints ?? []),
      // Unleash fails to turn on a flag whose strategy lists the same segment twice.
      segments: entry.segments ? [...new Set(segments)] : (base?.segments ?? []),
    },
  };
}

export async function updateProjectSettings(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = updateProjectSettingsSchema.parse(args);
    const { defaultStickiness, defaultStrategies = [] } = input;
    const addEnvironments = [...new Set(input.addEnvironments)];

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    const dryRun = context.config.server.dryRun;
    const mode = dryRun ? '[DRY RUN] ' : '';
    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${mode}Checking settings for "${projectId}"...`,
    );

    const lookups = await loadLookups(context, projectId, {
      defaultStickiness,
      addEnvironments,
      defaultStrategies,
    });
    const { settings: before, environmentNames, segments, contextFields } = lookups;
    const present = before.environments.map(({ environment }) => environment);
    const currentDefault = (environment: string) =>
      before.environments.find((entry) => entry.environment === environment)?.defaultStrategy;

    const problems: Problem[] = [];
    for (const environment of addEnvironments) {
      if (!environmentNames.includes(environment)) {
        problems.push({
          environment,
          code: 'ENVIRONMENT_NOT_FOUND',
          message: `Unleash has no environment "${environment}".`,
          hint: 'Ask the user which of these environments they mean.',
          options: environmentNames.filter((name) => !present.includes(name)),
        });
      }
    }

    const available = new Set([...present, ...addEnvironments]);
    const seen = new Set<string>();
    for (const { environment } of defaultStrategies) {
      if (!available.has(environment)) {
        problems.push({
          environment,
          code: 'ENVIRONMENT_NOT_IN_PROJECT',
          message: `"${environment}" is not in project "${projectId}".`,
          hint: 'Add it with addEnvironments if the user wants it.',
          options: present,
        });
      } else if (seen.has(environment)) {
        problems.push({
          environment,
          code: 'DUPLICATE_ENVIRONMENT',
          message: `"${environment}" appears more than once in defaultStrategies.`,
          hint: 'Merge its entries into one.',
        });
      }
      seen.add(environment);
    }

    const sticky = contextFields.filter(({ stickiness }) => stickiness).map(({ name }) => name);
    const stickinessOptions = ['default', ...sticky, 'random'];
    const stickinessValues: Array<{ environment?: string; value?: string }> = [
      { value: defaultStickiness },
      ...defaultStrategies.map((entry) => ({
        environment: entry.environment,
        value: entry.stickiness,
      })),
    ];
    for (const { environment, value } of stickinessValues) {
      if (value && !stickinessOptions.includes(value)) {
        problems.push({
          environment,
          code: 'INVALID_STICKINESS',
          message: `"${value}" cannot be used for stickiness.`,
          hint: 'Ask the user which of these context fields they mean.',
          options: stickinessOptions,
        });
      }
    }

    const projectStickiness = defaultStickiness ?? before.defaultStickiness ?? 'default';
    const strategies: Array<{ entry: DefaultStrategyInput; strategy: FlexibleRolloutStrategy }> =
      [];
    for (const entry of defaultStrategies) {
      const current = currentDefault(entry.environment);
      const built = await buildDefaultStrategy(
        context,
        projectId,
        entry,
        current,
        lookups,
        projectStickiness,
      );
      if ('problems' in built) problems.push(...built.problems);
      else strategies.push({ entry, strategy: built.strategy });
    }

    if (problems.length > 0) {
      return {
        isError: true,
        ...jsonResult({
          success: false,
          error: {
            code: 'INVALID_PROJECT_SETTINGS',
            message: `Nothing was changed. The request has ${problems.length} problem${problems.length === 1 ? '' : 's'}.`,
            hint: 'Fix each problem and call update_project_settings again. When a problem lists options, ask the user which one they mean rather than picking one yourself.',
          },
          problems,
        }),
      };
    }

    await context.notifyProgress(
      progressToken,
      40,
      100,
      `${mode}Saving settings for "${projectId}"...`,
    );

    // Stickiness goes first: on open source Unleash it fails, and then nothing has been changed.
    const steps: Array<{ change: SettingsChange; run: () => Promise<void> }> = [
      ...(defaultStickiness
        ? [
            {
              change: { defaultStickiness },
              run: () => setDefaultStickiness(context, projectId, before.name, defaultStickiness),
            },
          ]
        : []),
      ...addEnvironments
        .filter((environment) => !present.includes(environment))
        .map((environment) => ({
          change: { addEnvironments: [environment] },
          run: () => context.unleashClient.addEnvironmentToProject(projectId, environment),
        })),
      ...strategies.map(({ entry, strategy }) => ({
        change: { defaultStrategies: [entry] },
        run: () =>
          context.unleashClient.setProjectDefaultStrategy(projectId, entry.environment, strategy),
      })),
    ];
    for (const [index, step] of steps.entries()) {
      try {
        await step.run();
      } catch (error) {
        return {
          isError: true,
          ...jsonResult({
            ...toolErrorPayload(context, error, 'update_project_settings'),
            applied: combine(steps.slice(0, index).map(({ change }) => change)),
            failed: step.change,
            notApplied: combine(steps.slice(index + 1).map(({ change }) => change)),
            hint: 'Settings in applied were saved and are not rolled back. Fix the error, then call update_project_settings again with failed and notApplied.',
          }),
        };
      }
    }

    await context.notifyProgress(
      progressToken,
      90,
      100,
      `${mode}Reading back settings for "${projectId}"...`,
    );

    const after: ProjectSettings = dryRun
      ? {
          name: before.name,
          defaultStickiness: projectStickiness,
          environments: [...available].map((environment) => {
            const built = strategies.find(({ entry }) => entry.environment === environment);
            return {
              environment,
              defaultStrategy: built
                ? { name: 'flexibleRollout', ...built.strategy }
                : currentDefault(environment),
            };
          }),
        }
      : await fetchSettings(context, projectId);
    await context.notifyProgress(
      progressToken,
      100,
      100,
      `${mode}Updated settings for "${projectId}"`,
    );

    const baseUrl = context.config.unleash.baseUrl;
    return jsonResult({
      success: true,
      dryRun,
      projectId,
      applied: combine(steps.map(({ change }) => change)),
      defaultStickiness: after.defaultStickiness,
      defaultStrategies: after.environments.map(({ environment, defaultStrategy }) => ({
        environment,
        defaultStrategy: summarize(defaultStrategy, segments),
        ...(strategies.some(({ entry }) => entry.environment === environment) && {
          previous: summarize(currentDefault(environment), segments),
        }),
      })),
      links: {
        ui: `${baseUrl}/projects/${encodeURIComponent(projectId)}`,
        api: `${baseUrl}/api/admin/projects/${encodeURIComponent(projectId)}/overview`,
      },
    });
  } catch (error) {
    return handleToolError(context, error, 'update_project_settings');
  }
}

export const updateProjectSettingsTool = {
  name: 'update_project_settings',
  title: 'Update project settings',
  annotations: { readOnlyHint: false, destructiveHint: true },
  description:
    'Change how flags in a project are set up. ' +
    "An environment's default strategy is what Unleash adds when a flag with no enabled strategies there is turned on, by toggle_flag_environment or by set_flag_rollout with only enabled. Existing flags get it too, so confirm with the user before something like 100% for everyone in production. " +
    'Fields you leave out keep their current value. Nothing is changed until every name checks out. Default stickiness is set first, then environments are added, then default strategies. There is no rollback: if a step fails, the error lists what was applied and what was not.',
  inputSchema: updateProjectSettingsSchema,
  implementation: updateProjectSettings,
};
