import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  askToFindFlagProject,
  handleToolError,
  resolveProjectId,
  type ServerContext,
  toolErrorPayload,
} from '../context.js';
import type {
  ContextField,
  FeatureDetails,
  FeatureEnvironment,
  FeatureStrategy,
  FlexibleRolloutStrategy,
  SegmentSummary,
  StrategyConstraint,
  StrategyVariant,
  StrategyVariantPayload,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlagLinks } from '../utils/streaming.js';
import { jsonResult } from '../utils/toolResult.js';
import {
  CONTEXT_DOCS,
  type ConstraintInput,
  constraintSchema,
  invalidConstraint,
  shapeConstraint,
} from './constraints.js';

const SEGMENTS_DOCS = 'https://docs.getunleash.io/concepts/segments';
const NONE_OF_THESE = '__none__';

const variantPayloadSchema = z.strictObject({
  type: z.enum(['json', 'csv', 'string', 'number']).describe('Payload type'),
  value: z.string().min(1).describe('Serialized payload value'),
}) satisfies z.ZodType<StrategyVariantPayload>;

const variantSchema = z.strictObject({
  name: z.string().min(1).describe('Variant name (unique within this feature)'),
  weight: z.number().int().min(0).max(1000).describe('Variant weight (0-1000)'),
  weightType: z.enum(['variable', 'fix']).optional().describe('Variant weight type'),
  stickiness: z
    .string()
    .min(1)
    .optional()
    .describe('Stickiness to use for this variant (defaults to "default")'),
  payload: variantPayloadSchema.optional(),
});

const environmentRolloutSchema = z.strictObject({
  environment: z.string().min(1).describe('Environment name, such as "production"'),
  rolloutPercentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe(
      'Percentage of the targeted users who get the flag. A new strategy defaults to 100; leave it out to keep the current value.',
    ),
  segments: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'Names of the segments to target, as the user said them. Leave it out to keep the current segments; [] removes them.',
    ),
  constraints: z
    .array(constraintSchema)
    .optional()
    .describe(
      'Conditions on context fields, such as email ending with "@acme.com". Leave it out to keep the current constraints; [] removes them.',
    ),
  strategyId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The strategy to change when the environment has more than one. get_flag_state lists strategy IDs.',
    ),
  stickiness: z
    .string()
    .min(1)
    .optional()
    .describe('Context field that keeps a user in the same bucket. A new strategy uses "default".'),
  groupId: z
    .string()
    .min(1)
    .optional()
    .describe('Group ID for stickiness bucketing. A new strategy uses the flag name.'),
  title: z.string().optional().describe('Descriptive title for the strategy'),
  strategyDisabled: z
    .boolean()
    .optional()
    .describe(
      'Pause this strategy without deleting it. To turn the flag off in the environment, use enabled: false instead.',
    ),
  variants: z
    .array(variantSchema)
    .optional()
    .describe('Strategy variants. Leave it out to keep the current variants; [] removes them.'),
  enabled: z
    .boolean()
    .optional()
    .describe(
      'Turn the flag on or off in this environment. true also turns on the strategy if it was disabled, unless strategyDisabled is passed. Leave it out to keep it as it is.',
    ),
});

const setFlagRolloutSchema = z.strictObject({
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID where the feature flag resides (optional if UNLEASH_DEFAULT_PROJECT is set; search_flags finds it from the flag name)',
    ),
  featureName: z.string().min(1).describe('Feature flag name'),
  environments: z
    .array(environmentRolloutSchema)
    .min(1)
    .describe('Who gets the flag in each environment, one entry per environment'),
});

type EnvironmentRollout = z.infer<typeof environmentRolloutSchema>;

interface Problem {
  environment: string;
  code: string;
  message: string;
  hint: string;
  options?: unknown[];
}

/** A problem the user can settle by picking one of its options. */
interface Choosable {
  entryIndex: number;
  problem: Problem;
  hintOnceDeclined: string;
  title: string;
  options: Array<{ value: string; label: string }>;
  apply: (entry: EnvironmentRollout, value: string) => EnvironmentRollout;
}

interface Findings {
  problems: Problem[];
  choosables: Choosable[];
}

type StrategyTarget =
  | { kind: 'add' }
  | { kind: 'replace'; strategy: FeatureStrategy }
  | { kind: 'keep' };

interface EnvironmentPlan {
  entry: EnvironmentRollout;
  environment: FeatureEnvironment;
  target: StrategyTarget;
  segmentIds?: number[];
  constraints?: StrategyConstraint[];
}

interface Lookups {
  projectId: string;
  baseUrl: string;
  feature: FeatureDetails;
  segments: SegmentSummary[];
  contextFields: ContextField[];
}

interface AppliedEnvironment {
  environment: string;
  strategy: 'added' | 'updated' | 'unchanged';
  enabled: boolean;
  strategyId?: string;
  rolloutPercentage?: number;
  segments?: string[];
  constraints?: StrategyConstraint[];
  variants?: StrategyVariant[];
  previous?: {
    rolloutPercentage: number;
    segments: string[];
    constraints: StrategyConstraint[];
    variants: StrategyVariant[];
  };
  notes?: string[];
}

const normalizeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

const segmentName = (id: number, segments: SegmentSummary[]): string =>
  segments.find((segment) => segment.id === id)?.name ?? `#${id}`;

const STRATEGY_FIELDS = [
  'rolloutPercentage',
  'segments',
  'constraints',
  'strategyId',
  'stickiness',
  'groupId',
  'title',
  'strategyDisabled',
  'variants',
] as const;

const changesStrategy = (entry: EnvironmentRollout): boolean =>
  STRATEGY_FIELDS.some((field) => entry[field] !== undefined);

const fixedWeightTotal = (variants: z.infer<typeof variantSchema>[]): number | undefined =>
  variants.every((variant) => variant.weightType === 'fix')
    ? variants.reduce((total, variant) => total + variant.weight, 0)
    : undefined;

// Unleash needs one variable variant.
const toVariants = (variants: z.infer<typeof variantSchema>[]): StrategyVariant[] =>
  variants.map((variant, index) => ({
    ...variant,
    weightType:
      index === 0 && fixedWeightTotal(variants) === 1000
        ? 'variable'
        : (variant.weightType ?? 'variable'),
    stickiness: variant.stickiness ?? 'default',
  }));

function describeConstraint(constraint: StrategyConstraint): string {
  const values = constraint.values?.length
    ? constraint.values.join(', ')
    : (constraint.value ?? '');
  return `${constraint.contextName} ${constraint.inverted ? 'NOT ' : ''}${constraint.operator} ${values}`;
}

function describeStrategy(strategy: FeatureStrategy, segments: SegmentSummary[]): string {
  const title = strategy.title ? `"${strategy.title}": ` : '';
  const disabled = strategy.disabled ? ' (disabled)' : '';
  if (strategy.name !== 'flexibleRollout') return `${title}${strategy.name} strategy${disabled}`;

  const targets = [
    ...(strategy.segments ?? []).map((id) => `segment ${segmentName(id, segments)}`),
    ...(strategy.constraints ?? []).map(describeConstraint),
  ];
  const who = targets.length > 0 ? targets.join(' and ') : 'everyone';
  return `${title}${strategy.parameters.rollout ?? 100}% of ${who}${disabled}`;
}

function findEnvironment(feature: FeatureDetails, name: string): FeatureEnvironment | undefined {
  const target = name.toLowerCase();
  return feature.environments?.find(
    (env) => env.name.toLowerCase() === target || env.environment?.toLowerCase() === target,
  );
}

function notFlexibleRollout(environment: string, strategy: FeatureStrategy): Problem {
  return {
    environment,
    code: 'STRATEGY_NOT_SUPPORTED',
    message: `Strategy ${strategy.id} in "${environment}" is a ${strategy.name} strategy, and set_flag_rollout only changes flexibleRollout strategies.`,
    hint: 'Change it in the Unleash UI, or remove it with remove_flag_strategy and call set_flag_rollout again to add a flexible rollout.',
  };
}

function pickStrategy(
  entryIndex: number,
  entry: EnvironmentRollout,
  environment: FeatureEnvironment,
  segments: SegmentSummary[],
  findings: Findings,
): StrategyTarget | undefined {
  const strategies = environment.strategies ?? [];
  const flexible = strategies.filter((strategy) => strategy.name === 'flexibleRollout');
  const env = environment.name;

  const askForStrategy = (message: string): undefined => {
    const options = flexible.map((strategy) => ({
      value: strategy.id,
      label: describeStrategy(strategy, segments),
    }));
    findings.choosables.push({
      entryIndex,
      problem: {
        environment: env,
        code: 'STRATEGY_NOT_CHOSEN',
        message,
        hint: 'Ask the user which strategy to change, then pass its ID as strategyId.',
        options: options.map(({ value, label }) => ({ strategyId: value, description: label })),
      },
      hintOnceDeclined:
        'The user was shown these strategies and picked none. Ask them what they want to change; set_flag_rollout cannot add a second strategy yet.',
      title: `Strategy to change in ${env}`,
      options,
      apply: (current, value) => ({ ...current, strategyId: value }),
    });
    return undefined;
  };

  if (entry.strategyId) {
    const strategy = strategies.find((candidate) => candidate.id === entry.strategyId);
    if (strategy?.name === 'flexibleRollout') return { kind: 'replace', strategy };
    if (strategy) {
      findings.problems.push(notFlexibleRollout(env, strategy));
      return undefined;
    }
    if (flexible.length > 0) {
      return askForStrategy(`"${env}" has no strategy with ID ${entry.strategyId}.`);
    }
    findings.problems.push({
      environment: env,
      code: 'STRATEGY_NOT_FOUND',
      message: `"${env}" has no strategy with ID ${entry.strategyId}.`,
      hint:
        strategies.length === 0
          ? 'Leave out strategyId to add a new strategy.'
          : `"${env}" has no flexibleRollout strategy, the only kind set_flag_rollout changes. Change its strategies in the Unleash UI, or remove them with remove_flag_strategy and call set_flag_rollout again without strategyId.`,
    });
    return undefined;
  }

  if (!changesStrategy(entry)) return { kind: 'keep' };
  if (strategies.length === 0) return { kind: 'add' };
  if (flexible.length === 1) return { kind: 'replace', strategy: flexible[0] };
  if (flexible.length === 0) {
    findings.problems.push(notFlexibleRollout(env, strategies[0]));
    return undefined;
  }
  return askForStrategy(
    `"${env}" has ${flexible.length} flexible rollout strategies, so it is not clear which one to change.`,
  );
}

function resolveSegments(
  entryIndex: number,
  entry: EnvironmentRollout,
  environment: string,
  lookups: Lookups,
  findings: Findings,
): number[] | undefined {
  if (!entry.segments) return undefined;

  const { projectId, baseUrl } = lookups;
  const usable = lookups.segments.filter(
    (segment) => !segment.project || segment.project === projectId,
  );
  const ids: number[] = [];

  for (const name of entry.segments) {
    // Segment names are unique across the instance, so an exact match settles it.
    const exact = usable.find((segment) => segment.name === name);
    const loose = usable.filter((segment) => normalizeName(segment.name) === normalizeName(name));
    const match = exact ?? (loose.length === 1 ? loose[0] : undefined);
    if (match) {
      ids.push(match.id);
      continue;
    }

    if (usable.length === 0) {
      findings.problems.push({
        environment,
        code: 'SEGMENT_NOT_FOUND',
        message: `Project "${projectId}" has no segments it can use, so "${name}" cannot be targeted.`,
        hint: `Ask the user who should get the flag and target them with constraints instead, or whether to create the segment with create_targeting or in Unleash (${baseUrl}/segments/create). See ${SEGMENTS_DOCS}.`,
      });
      continue;
    }

    const inOtherProject = lookups.segments.find(
      (segment) =>
        normalizeName(segment.name) === normalizeName(name) &&
        segment.project &&
        segment.project !== projectId,
    );
    let message = `No segment named "${name}" exists in project "${projectId}".`;
    if (loose.length > 1) message = `Several segments have a name like "${name}".`;
    else if (inOtherProject)
      message = `Segment "${inOtherProject.name}" belongs to project "${inOtherProject.project}", so this flag cannot use it.`;
    const candidates = loose.length > 1 ? loose : usable;

    findings.choosables.push({
      entryIndex,
      problem: {
        environment,
        code: 'SEGMENT_NOT_FOUND',
        message,
        hint: 'Ask the user which of these segments they mean, then pass its name. If none fits, ask who should get the flag and target them with constraints instead.',
        options: candidates.map(({ name, description }) => ({ name, description })),
      },
      hintOnceDeclined:
        'The user was shown these segments and picked none. Ask them who should get the flag and target those users with constraints instead.',
      title: `Segment for "${name}" in ${environment}`,
      options: candidates.map((segment) => ({
        value: segment.name,
        label: segment.description ? `${segment.name}: ${segment.description}` : segment.name,
      })),
      apply: (current, value) => ({
        ...current,
        segments: current.segments?.map((requested) => (requested === name ? value : requested)),
      }),
    });
  }

  // Two names can match the same segment, and Unleash fails on a repeated segment ID.
  return ids.length === entry.segments.length ? [...new Set(ids)] : undefined;
}

async function checkConstraint(
  context: ServerContext,
  input: ConstraintInput,
  environment: string,
  lookups: Lookups,
): Promise<{ constraint: StrategyConstraint } | { problem: Problem }> {
  const field = lookups.contextFields.find((candidate) => candidate.name === input.contextName);
  if (!field) {
    const differentCase = lookups.contextFields.find(
      (candidate) => candidate.name.toLowerCase() === input.contextName.toLowerCase(),
    );
    return {
      problem: {
        environment,
        code: 'CONTEXT_FIELD_NOT_FOUND',
        message: `"${input.contextName}" is not a context field in project "${lookups.projectId}".`,
        hint: differentCase
          ? `Context field names are case-sensitive; did you mean "${differentCase.name}"?`
          : `Use one of the listed fields, or ask the user whether to create "${input.contextName}" with create_targeting or in Unleash (${lookups.baseUrl}/context/create). A constraint on it only matches when the app also sends "${input.contextName}" in its Unleash context. See ${CONTEXT_DOCS}.`,
        options: lookups.contextFields.map(({ name }) => name),
      },
    };
  }

  const shaped = shapeConstraint(input);
  if ('problem' in shaped) return { problem: { environment, ...shaped.problem } };

  const invalid = await invalidConstraint(context.unleashClient, shaped.constraint, field);
  if (invalid) return { problem: { environment, ...invalid } };

  return shaped;
}

async function checkConstraints(
  context: ServerContext,
  entry: EnvironmentRollout,
  environment: string,
  lookups: Lookups,
  findings: Findings,
): Promise<StrategyConstraint[] | undefined> {
  if (!entry.constraints) return undefined;

  const results = await Promise.all(
    entry.constraints.map((constraint) =>
      checkConstraint(context, constraint, environment, lookups),
    ),
  );
  const constraints: StrategyConstraint[] = [];
  for (const result of results) {
    if ('problem' in result) findings.problems.push(result.problem);
    else constraints.push(result.constraint);
  }
  return constraints.length === results.length ? constraints : undefined;
}

/**
 * Unleash turns an environment off when its last active strategy is paused, and turning it back on
 * with only paused strategies adds the default strategy, so the environment cannot stay on that way.
 */
function pausesLastActiveStrategy(
  entry: EnvironmentRollout,
  environment: FeatureEnvironment,
  target: StrategyTarget,
): boolean {
  if (!entry.strategyDisabled || !(entry.enabled ?? environment.enabled)) return false;
  const pausedId = target.kind === 'replace' ? target.strategy.id : undefined;
  return (environment.strategies ?? []).every(
    (strategy) => strategy.disabled || strategy.id === pausedId,
  );
}

/** Checks every entry against Unleash before anything is written. */
async function plan(
  context: ServerContext,
  entries: EnvironmentRollout[],
  lookups: Lookups,
): Promise<{ plans: EnvironmentPlan[] } & Findings> {
  const findings: Findings = { problems: [], choosables: [] };
  const plans: EnvironmentPlan[] = [];
  const seen = new Set<string>();

  for (const [entryIndex, entry] of entries.entries()) {
    const environment = findEnvironment(lookups.feature, entry.environment);
    if (!environment) {
      findings.problems.push({
        environment: entry.environment,
        code: 'ENVIRONMENT_NOT_FOUND',
        message: `Flag "${lookups.feature.name}" has no environment "${entry.environment}".`,
        hint: 'Use one of the listed environments.',
        options: (lookups.feature.environments ?? []).map(({ name }) => name),
      });
      continue;
    }
    if (seen.has(environment.name)) {
      findings.problems.push({
        environment: environment.name,
        code: 'DUPLICATE_ENVIRONMENT',
        message: `"${environment.name}" appears more than once.`,
        hint: 'Merge its entries into one.',
      });
      continue;
    }
    seen.add(environment.name);

    const found = findings.problems.length + findings.choosables.length;
    const target = pickStrategy(entryIndex, entry, environment, lookups.segments, findings);
    if (target && pausesLastActiveStrategy(entry, environment, target)) {
      findings.problems.push({
        environment: environment.name,
        code: 'LAST_STRATEGY_PAUSED',
        message: `"${environment.name}" cannot stay on with its only active strategy paused: Unleash turns the environment off, and turning it back on adds the project's default strategy, usually 100% for everyone.`,
        hint: `To turn the flag off in "${environment.name}", pass enabled: false. To keep it on, leave strategyDisabled out.`,
      });
    }
    const total = entry.variants?.length ? fixedWeightTotal(entry.variants) : undefined;
    if (total !== undefined && total !== 1000) {
      findings.problems.push({
        environment: environment.name,
        code: 'INVALID_VARIANTS',
        message: `Fixed variant weights must add up to 1000 (100%) when no variant is variable; these add up to ${total}.`,
        hint: 'Change the weights to add up to 1000, or leave weightType out on one variant so it takes the rest.',
      });
    }
    const segmentIds = resolveSegments(entryIndex, entry, environment.name, lookups, findings);
    const constraints = await checkConstraints(context, entry, environment.name, lookups, findings);
    if (target && findings.problems.length + findings.choosables.length === found) {
      plans.push({ entry, environment, target, segmentIds, constraints });
    }
  }

  return { plans, ...findings };
}

/** Returns the entries with the user's picks applied, or undefined when nothing was picked. */
async function askUser(
  context: ServerContext,
  featureName: string,
  entries: EnvironmentRollout[],
  choosables: Choosable[],
): Promise<EnvironmentRollout[] | undefined> {
  const answers = await context.askUserToChoose(
    `To set the rollout for "${featureName}", pick what you meant:`,
    choosables.map((choosable, index) => ({
      key: `choice${index}`,
      title: choosable.title,
      options: [...choosable.options, { value: NONE_OF_THESE, label: 'None of these' }],
    })),
  );
  if (!answers) return undefined;

  const answered = [...entries];
  for (const [index, choosable] of choosables.entries()) {
    const value = answers[`choice${index}`];
    if (value && value !== NONE_OF_THESE) {
      answered[choosable.entryIndex] = choosable.apply(answered[choosable.entryIndex], value);
    }
  }
  return answered;
}

function buildStrategy(
  plan: EnvironmentPlan & { target: { kind: 'add' | 'replace' } },
  featureName: string,
): FlexibleRolloutStrategy {
  const { entry, target, segmentIds, constraints } = plan;
  const variants = entry.variants && toVariants(entry.variants);
  if (target.kind === 'add') {
    return {
      title: entry.title,
      disabled: entry.strategyDisabled ?? false,
      variants,
      parameters: {
        rollout: String(entry.rolloutPercentage ?? 100),
        stickiness: entry.stickiness ?? 'default',
        groupId: entry.groupId ?? featureName,
      },
      constraints: constraints ?? [],
      segments: segmentIds ?? [],
    };
  }

  const current = target.strategy;
  const parameters = { ...current.parameters };
  if (entry.rolloutPercentage !== undefined) parameters.rollout = String(entry.rolloutPercentage);
  if (entry.stickiness !== undefined) parameters.stickiness = entry.stickiness;
  if (entry.groupId !== undefined) parameters.groupId = entry.groupId;
  return {
    title: entry.title ?? current.title,
    disabled: entry.strategyDisabled ?? (entry.enabled ? false : current.disabled),
    variants: variants ?? current.variants,
    parameters,
    constraints: constraints ?? current.constraints ?? [],
    segments: segmentIds ?? current.segments ?? [],
  };
}

function summarize(strategy: FeatureStrategy, segments: SegmentSummary[]) {
  return {
    rolloutPercentage: Number(strategy.parameters.rollout ?? 100),
    segments: (strategy.segments ?? []).map((id) => segmentName(id, segments)),
    constraints: strategy.constraints ?? [],
    variants: (strategy.variants ?? []).map(
      ({ name, weight, weightType, payload, stickiness }) => ({
        name,
        weight,
        weightType,
        stickiness,
        ...(payload && { payload }),
      }),
    ),
  };
}

async function apply(
  context: ServerContext,
  projectId: string,
  featureName: string,
  plan: EnvironmentPlan,
  segments: SegmentSummary[],
): Promise<AppliedEnvironment> {
  const { entry, environment, target } = plan;
  const env = environment.name;
  const enabled = entry.enabled ?? environment.enabled;

  // Turn off first, so the new strategy never goes live in an environment that is being turned off.
  if (!enabled && environment.enabled) {
    await context.unleashClient.toggleFeatureEnvironment(projectId, featureName, env, false);
  }

  let saved: FeatureStrategy | undefined;
  if (target.kind === 'add') {
    saved = await context.unleashClient.addFlexibleRolloutStrategy(
      projectId,
      featureName,
      env,
      buildStrategy({ ...plan, target }, featureName),
    );
  } else if (target.kind === 'replace') {
    saved = await context.unleashClient.replaceFlexibleRolloutStrategy(
      projectId,
      featureName,
      env,
      target.strategy.id,
      buildStrategy({ ...plan, target }, featureName),
    );
  }

  const notes: string[] = [];
  const strategies = [
    ...(environment.strategies ?? []).filter((strategy) => strategy.id !== saved?.id),
    ...(saved ? [saved] : []),
  ];
  const onlyPaused = strategies.length > 0 && strategies.every((strategy) => strategy.disabled);
  // Turn on after saving, or Unleash adds the project's default strategy next to the new one.
  if (enabled && !environment.enabled) {
    await context.unleashClient.toggleFeatureEnvironment(projectId, featureName, env, true, {
      activateDisabledStrategies: onlyPaused,
    });
    if (strategies.length === 0) {
      notes.push(
        `"${env}" had no strategies, so Unleash gave it the project's default strategy. get_flag_state shows it.`,
      );
    }
    if (onlyPaused) {
      notes.push(`Every strategy in "${env}" was disabled, so Unleash turned them all back on.`);
    }
  }

  if (entry.variants && fixedWeightTotal(entry.variants) === 1000) {
    notes.push(
      `Unleash needs one variable variant, so "${entry.variants[0].name}" was saved as variable. It keeps its weight of ${entry.variants[0].weight}.`,
    );
  }
  if (saved?.disabled && entry.strategyDisabled === undefined) {
    notes.push('This strategy is disabled, so it has no effect. Pass enabled: true to turn it on.');
  }
  const others = (environment.strategies ?? []).filter(
    (strategy) => strategy.id !== saved?.id && !strategy.disabled,
  ).length;
  if (saved && others > 0) {
    notes.push(
      `"${env}" has ${others} other active strateg${others === 1 ? 'y' : 'ies'}; a user who matches any strategy gets the flag.`,
    );
  }
  if (!enabled && entry.enabled === undefined) {
    notes.push(`The flag is off in "${env}". Pass enabled: true to turn it on.`);
  }

  return {
    environment: env,
    strategy: target.kind === 'add' ? 'added' : target.kind === 'replace' ? 'updated' : 'unchanged',
    enabled,
    ...(saved && { strategyId: saved.id, ...summarize(saved, segments) }),
    ...(target.kind === 'replace' && { previous: summarize(target.strategy, segments) }),
    ...(notes.length > 0 && { notes }),
  };
}

async function fetchFeature(
  context: ServerContext,
  projectId: string,
  featureName: string,
): Promise<FeatureDetails> {
  try {
    return await context.unleashClient.getFeature(projectId, featureName);
  } catch (error) {
    if (error instanceof CustomError && error.code === 'HTTP_404') {
      throw new CustomError(
        error.code,
        error.message,
        `Create the flag with create_flag first, or call search_flags to find the project "${featureName}" is in.`,
      );
    }
    throw error;
  }
}

async function loadLookups(
  context: ServerContext,
  projectId: string,
  featureName: string,
  entries: EnvironmentRollout[],
): Promise<Lookups> {
  const baseUrl = context.config.unleash.baseUrl;
  const feature = await fetchFeature(context, projectId, featureName);
  if (context.config.server.dryRun) return dryRunLookups(feature, entries, projectId, baseUrl);

  const needsSegments =
    entries.some((entry) => entry.segments?.length) ||
    (feature.environments ?? []).some((env) =>
      env.strategies?.some((strategy) => strategy.segments?.length),
    );
  const needsContextFields = entries.some((entry) => entry.constraints?.length);
  const [segments, contextFields] = await Promise.all([
    needsSegments ? context.unleashClient.listSegments() : [],
    needsContextFields ? context.unleashClient.getContextFields(projectId) : [],
  ]);
  return { projectId, baseUrl, feature, segments, contextFields };
}

/** Dry run calls no API, so every name in the request counts as found. */
function dryRunLookups(
  feature: FeatureDetails,
  entries: EnvironmentRollout[],
  projectId: string,
  baseUrl: string,
): Lookups {
  const environments = new Set(entries.map((entry) => entry.environment));
  const segments = new Set(entries.flatMap((entry) => entry.segments ?? []));
  const contextNames = new Set(
    entries.flatMap((entry) => (entry.constraints ?? []).map(({ contextName }) => contextName)),
  );
  return {
    projectId,
    baseUrl,
    feature: {
      ...feature,
      environments: [...environments].map((name) => ({
        name,
        environment: name,
        featureName: feature.name,
        enabled: false,
        strategies: [],
      })),
    },
    segments: [...segments].map((name, index) => ({ id: index + 1, name, project: null })),
    contextFields: [...contextNames].map((name) => ({ name, legalValues: [] })),
  };
}

function problemsResult(
  context: ServerContext,
  featureName: string,
  problems: Problem[],
): CallToolResult {
  context.logger.warn(
    `set_flag_rollout rejected "${featureName}": ${problems.map(({ code }) => code).join(', ')}`,
  );
  return {
    isError: true,
    ...jsonResult({
      success: false,
      error: {
        code: 'INVALID_ROLLOUT',
        message: `Nothing was changed. The request has ${problems.length} problem${problems.length === 1 ? '' : 's'}.`,
        hint: 'Fix each problem and call set_flag_rollout again. When a problem lists options, ask the user which one they mean rather than picking one yourself.',
      },
      problems,
    }),
  };
}

export async function setFlagRollout(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input = setFlagRolloutSchema.parse(args);

    const projectId = await resolveProjectId(input.projectId, context);
    if (!projectId) return askToFindFlagProject(input.featureName);

    const mode = context.config.server.dryRun ? '[DRY RUN] ' : '';
    await context.notifyProgress(
      progressToken,
      0,
      100,
      `${mode}Checking the rollout for "${input.featureName}"...`,
    );

    let lookups = await loadLookups(context, projectId, input.featureName, input.environments);
    let checked = await plan(context, input.environments, lookups);
    let asked = false;
    if (checked.problems.length === 0 && checked.choosables.length > 0) {
      const answered = await askUser(
        context,
        input.featureName,
        input.environments,
        checked.choosables,
      );
      if (answered) {
        asked = true;
        // Fetch again, or the update would undo strategy edits made while the form was open.
        lookups = await loadLookups(context, projectId, input.featureName, answered);
        checked = await plan(context, answered, lookups);
      }
    }

    const problems = [
      ...checked.problems,
      ...checked.choosables.map(({ problem, hintOnceDeclined }) =>
        asked ? { ...problem, hint: hintOnceDeclined } : problem,
      ),
    ];
    if (problems.length > 0) return problemsResult(context, input.featureName, problems);

    await context.notifyProgress(
      progressToken,
      50,
      100,
      `${mode}Saving the rollout for "${input.featureName}"...`,
    );

    const applied: AppliedEnvironment[] = [];
    for (const [index, environmentPlan] of checked.plans.entries()) {
      try {
        applied.push(
          await apply(context, projectId, input.featureName, environmentPlan, lookups.segments),
        );
      } catch (error) {
        const failed = environmentPlan.environment.name;
        return {
          isError: true,
          ...jsonResult({
            ...toolErrorPayload(context, error, 'set_flag_rollout'),
            failedEnvironment: failed,
            applied,
            notChanged: checked.plans.slice(index + 1).map((p) => p.environment.name),
            hint: `The environments in applied were saved and those in notChanged were not changed. "${failed}" failed and may be partly changed, so check it with get_flag_state. Fix the error, then call set_flag_rollout again for the environments that were not saved.`,
          }),
        };
      }
    }

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `${mode}Saved the rollout for "${input.featureName}" in ${applied.length} environment${applied.length === 1 ? '' : 's'}`,
    );

    const { url, resourceUri } = createFlagLinks(
      context.config.unleash.baseUrl,
      projectId,
      input.featureName,
    );
    const apiUrl = `${context.config.unleash.baseUrl}/api/admin/projects/${encodeURIComponent(
      projectId,
    )}/features/${encodeURIComponent(input.featureName)}`;

    context.logger.info(
      `${mode}Saved the rollout for "${input.featureName}" in ${applied.map((a) => a.environment).join(', ')}`,
    );

    return jsonResult({
      success: true,
      dryRun: context.config.server.dryRun,
      projectId,
      featureName: input.featureName,
      environments: applied,
      links: {
        ui: url,
        api: apiUrl,
        resourceUri,
      },
    });
  } catch (error) {
    return handleToolError(context, error, 'set_flag_rollout');
  }
}

export const setFlagRolloutTool = {
  name: 'set_flag_rollout',
  title: 'Set flag rollout',
  annotations: { readOnlyHint: false, destructiveHint: true },
  description:
    'Set who gets a feature flag in one or more environments: a rollout percentage, optionally narrowed to segments and to constraints on context fields, and whether the environment is on. ' +
    'Pass segment and context field names as the user said them; do not look them up first. Nothing is changed until every name checks out. When a name does not match, the user is asked to pick, or the error lists the valid options. ' +
    'An environment without strategies gets a new flexibleRollout strategy when the entry sets any strategy field; turning it on with only enabled gives it the project default strategy. With one, that strategy is updated and fields you leave out keep their value; with several, pass strategyId.',
  inputSchema: setFlagRolloutSchema,
  implementation: setFlagRollout,
};
