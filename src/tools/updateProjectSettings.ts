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
  SegmentSummary,
  StrategyConstraint,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { jsonResult } from '../utils/toolResult.js';
import { constraintSchema, shapeConstraint } from './constraints.js';
import { normalizeName } from './setFlagRollout.js';

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
});

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
      .describe('The strategy new flags start with, per environment'),
  })
  .refine(
    (input) =>
      input.defaultStickiness || input.addEnvironments?.length || input.defaultStrategies?.length,
    { message: 'Pass at least one of defaultStickiness, addEnvironments or defaultStrategies.' },
  );

type DefaultStrategyInput = z.infer<typeof defaultStrategySchema>;
type DefaultStrategy = Omit<FeatureStrategy, 'id'>;

interface Problem {
  code: string;
  message: string;
  options?: string[];
}

interface Lookups {
  projectId: string;
  segments: SegmentSummary[];
  contextFields: ContextField[];
  projectStickiness: string;
}

const summarize = (strategy: DefaultStrategy | undefined, segments: SegmentSummary[]) =>
  strategy && {
    rolloutPercentage: Number(strategy.parameters?.rollout ?? 100),
    stickiness: strategy.parameters?.stickiness,
    segments: (strategy.segments ?? []).map(
      (id) => segments.find((segment) => segment.id === id)?.name ?? `#${id}`,
    ),
    constraints: strategy.constraints ?? [],
  };

async function buildDefaultStrategy(
  context: ServerContext,
  entry: DefaultStrategyInput,
  current: DefaultStrategy | undefined,
  lookups: Lookups,
  problems: Problem[],
): Promise<FlexibleRolloutStrategy> {
  const { environment } = entry;
  const { projectId, contextFields } = lookups;
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
        code: 'SEGMENT_NOT_FOUND',
        message: `No single segment in project "${projectId}" matches "${name}" (${environment}). Ask the user which one they mean.`,
        options: (loose.length > 1 ? loose : usable).map((segment) => segment.name),
      });
  }

  const constraints: StrategyConstraint[] = [];
  for (const input of entry.constraints ?? []) {
    if (!contextFields.some(({ name }) => name === input.contextName)) {
      problems.push({
        code: 'CONTEXT_FIELD_NOT_FOUND',
        message: `"${input.contextName}" is not a context field in project "${projectId}" (${environment}).`,
        options: contextFields.map(({ name }) => name),
      });
      continue;
    }
    const shaped = shapeConstraint(input);
    if ('problem' in shaped) {
      problems.push({ code: shaped.problem.code, message: shaped.problem.message });
      continue;
    }
    try {
      await context.unleashClient.validateConstraint(shaped.constraint);
      constraints.push(shaped.constraint);
    } catch (error) {
      if (!(error instanceof CustomError && error.code === 'HTTP_400')) throw error;
      problems.push({ code: 'INVALID_CONSTRAINT', message: error.message });
    }
  }

  return {
    title: current?.title,
    disabled: current?.disabled,
    variants: current?.variants,
    parameters: {
      ...current?.parameters,
      rollout: String(entry.rolloutPercentage ?? current?.parameters?.rollout ?? 100),
      stickiness: entry.stickiness ?? current?.parameters?.stickiness ?? lookups.projectStickiness,
    },
    constraints: entry.constraints ? constraints : (current?.constraints ?? []),
    // Unleash fails to turn on a flag whose strategy lists the same segment twice.
    segments: entry.segments ? [...new Set(segments)] : (current?.segments ?? []),
  };
}

export async function updateProjectSettings(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = updateProjectSettingsSchema.parse(args);
    const { defaultStickiness, addEnvironments = [], defaultStrategies = [] } = input;

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askForProjectId(context);

    await context.notifyProgress(progressToken, 0, 100, `Checking settings for "${projectId}"...`);

    const before = await context.unleashClient.getProjectSettings(projectId);
    const present = before.environments.map(({ environment }) => environment);
    const currentDefault = (environment: string) =>
      before.environments.find((entry) => entry.environment === environment)?.defaultStrategy;

    const [existing, segments, contextFields]: [string[], SegmentSummary[], ContextField[]] =
      await Promise.all([
        addEnvironments.length > 0 ? context.unleashClient.listEnvironmentNames() : [],
        defaultStrategies.some((entry) => entry.segments?.length) ||
        before.environments.some(({ defaultStrategy }) => defaultStrategy?.segments?.length)
          ? context.unleashClient.listSegments()
          : [],
        defaultStickiness ||
        defaultStrategies.some((entry) => entry.constraints?.length || entry.stickiness)
          ? context.unleashClient.getContextFields(projectId)
          : [],
      ]);

    const problems: Problem[] = [];
    for (const environment of addEnvironments) {
      if (!existing.includes(environment)) {
        problems.push({
          code: 'ENVIRONMENT_NOT_FOUND',
          message: `Unleash has no environment "${environment}". Ask the user which one they mean.`,
          options: existing.filter((name) => !present.includes(name)),
        });
      }
    }

    const available = new Set([...present, ...addEnvironments]);
    for (const { environment } of defaultStrategies) {
      if (!available.has(environment)) {
        problems.push({
          code: 'ENVIRONMENT_NOT_IN_PROJECT',
          message: `"${environment}" is not in project "${projectId}". Add it with addEnvironments if the user wants it.`,
          options: present,
        });
      }
    }

    const sticky = contextFields.filter(({ stickiness }) => stickiness).map(({ name }) => name);
    const stickinessOptions = ['default', ...sticky, 'random'];
    const stickinessValues = [defaultStickiness, ...defaultStrategies.map((e) => e.stickiness)];
    for (const value of stickinessValues) {
      if (value && !stickinessOptions.includes(value)) {
        problems.push({
          code: 'INVALID_STICKINESS',
          message: `"${value}" cannot be used for stickiness.`,
          options: stickinessOptions,
        });
      }
    }

    const lookups: Lookups = {
      projectId,
      segments,
      contextFields,
      projectStickiness: defaultStickiness ?? before.defaultStickiness ?? 'default',
    };
    const strategies: Array<{ environment: string; strategy: FlexibleRolloutStrategy }> = [];
    for (const entry of defaultStrategies) {
      const current = currentDefault(entry.environment);
      const strategy = await buildDefaultStrategy(context, entry, current, lookups, problems);
      strategies.push({ environment: entry.environment, strategy });
    }

    if (problems.length > 0) {
      return {
        isError: true,
        ...jsonResult({
          success: false,
          error: {
            code: 'INVALID_PROJECT_SETTINGS',
            message:
              'Nothing was changed. Fix the problems and call update_project_settings again.',
          },
          problems,
        }),
      };
    }

    await context.notifyProgress(progressToken, 40, 100, `Saving settings for "${projectId}"...`);

    const applied: string[] = [];
    const steps: Array<{ label: string; run: () => Promise<void> }> = [
      ...addEnvironments
        .filter((environment) => !present.includes(environment))
        .map((environment) => ({
          label: `added environment ${environment}`,
          run: () => context.unleashClient.addEnvironmentToProject(projectId, environment),
        })),
      ...(defaultStickiness
        ? [
            {
              label: `default stickiness ${defaultStickiness}`,
              run: () =>
                context.unleashClient.setProjectDefaultStickiness(projectId, defaultStickiness),
            },
          ]
        : []),
      ...strategies.map(({ environment, strategy }) => ({
        label: `default strategy in ${environment}`,
        run: () =>
          context.unleashClient.setProjectDefaultStrategy(projectId, environment, strategy),
      })),
    ];
    for (const step of steps) {
      try {
        await step.run();
        applied.push(step.label);
      } catch (error) {
        return {
          isError: true,
          ...jsonResult({
            ...toolErrorPayload(context, error, 'update_project_settings'),
            applied,
            failed: step.label,
            notApplied: steps.slice(applied.length + 1).map(({ label }) => label),
            hint: 'Applied settings were saved and are not rolled back. Fix the error, then call update_project_settings again for the rest.',
          }),
        };
      }
    }

    await context.notifyProgress(
      progressToken,
      90,
      100,
      `Reading back settings for "${projectId}"...`,
    );

    const after = await context.unleashClient.getProjectSettings(projectId);
    await context.notifyProgress(progressToken, 100, 100, `Updated settings for "${projectId}"`);

    const baseUrl = context.config.unleash.baseUrl;
    return jsonResult({
      success: true,
      dryRun: context.config.server.dryRun,
      projectId,
      applied,
      defaultStickiness: after.defaultStickiness,
      defaultStrategies: after.environments.map(({ environment, defaultStrategy }) => ({
        environment,
        defaultStrategy: summarize(defaultStrategy, segments),
        ...(strategies.some((entry) => entry.environment === environment) && {
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
    'Change how flags in a project are set up. defaultStickiness is the context field that keeps a user in the same bucket for rollouts and variants. ' +
    'addEnvironments makes existing environments available in the project; it cannot remove any. ' +
    'defaultStrategies sets, per environment, the rollout percentage, segments (by name) and constraints that new flags start with. Fields you leave out keep their current value, and set_flag_rollout gives this strategy to an environment it turns on with only enabled. ' +
    'It changes what real users get, so confirm with the user before something like 100% for everyone in production. ' +
    'Environments are added first, then the other settings. Nothing is changed until every name checks out. There is no rollback: if a step fails, the error lists what was applied.',
  inputSchema: updateProjectSettingsSchema,
  implementation: updateProjectSettings,
};
