import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { handleToolError, type ServerContext } from '../context.js';
import type {
  PlaygroundConstraintResult,
  PlaygroundFeatureResponse,
  PlaygroundStrategyResult,
  UnleashContext,
} from '../unleash/client.js';
import { CustomError } from '../utils/errors.js';
import { createFlagLinks } from '../utils/streaming.js';

const DEFAULT_APP_NAME = 'unleash-mcp';

const STANDARD_CONTEXT_FIELDS = [
  'appName',
  'userId',
  'sessionId',
  'remoteAddress',
  'currentTime',
] as const;

const contextScalar = z.union([z.string(), z.number(), z.boolean()]);

const evaluateFlagSchema = z.object({
  featureName: z.string().min(1).describe('Feature flag name to evaluate'),
  environment: z
    .string()
    .optional()
    .describe(
      'Environment to evaluate the flag in (optional if UNLEASH_DEFAULT_ENVIRONMENT is set)',
    ),
  context: z
    .record(z.string(), z.union([contextScalar, z.record(z.string(), contextScalar)]))
    .default({})
    .describe(
      'Unleash context as a flat object, e.g. {"userId": "123", "tier": "top"}. ' +
        'userId, sessionId, remoteAddress, currentTime and appName are standard fields; ' +
        'any other key is sent as a custom context property.',
    ),
  appName: z
    .string()
    .min(1)
    .optional()
    .describe(`Application name for the context (default: "${DEFAULT_APP_NAME}")`),
});

type EvaluateFlagInput = z.infer<typeof evaluateFlagSchema>;

/**
 * Map a flat, agent-friendly context into the Unleash SDK context shape:
 * standard fields stay top-level, everything else goes into `properties`.
 */
export function buildUnleashContext(
  flat: EvaluateFlagInput['context'],
  appName?: string,
): UnleashContext {
  const context: UnleashContext = { appName: appName ?? DEFAULT_APP_NAME };
  const properties: Record<string, string> = {};

  for (const [key, value] of Object.entries(flat)) {
    if (typeof value === 'object') {
      if (key === 'properties') {
        for (const [propKey, propValue] of Object.entries(value)) {
          properties[propKey] = String(propValue);
        }
      } else {
        throw new CustomError(
          'VALIDATION_ERROR',
          `Context field "${key}" must be a string, number or boolean.`,
          'Only "properties" may hold a nested object.',
        );
      }
    } else if ((STANDARD_CONTEXT_FIELDS as readonly string[]).includes(key)) {
      // An explicit appName argument wins over one passed inside the context.
      if (key !== 'appName' || !appName) context[key] = String(value);
    } else {
      properties[key] = String(value);
    }
  }

  if (Object.keys(properties).length > 0) context.properties = properties;
  return context;
}

function formatConstraint(constraint: PlaygroundConstraintResult): string {
  const values = constraint.values?.length
    ? constraint.values.join(', ')
    : (constraint.value ?? '');
  const negation = constraint.inverted ? 'NOT ' : '';
  return `${constraint.contextName} ${negation}${constraint.operator} [${values}]`;
}

function summarizeStrategy(strategy: PlaygroundStrategyResult): string[] {
  const label = strategy.title ? `${strategy.title} (${strategy.name})` : strategy.name;
  let outcome: string;
  if (strategy.disabled) {
    outcome = 'disabled strategy, not evaluated';
  } else if (strategy.result.evaluationStatus === 'complete') {
    outcome = strategy.result.enabled ? 'matched' : 'did not match';
  } else if (strategy.result.enabled === 'unknown') {
    outcome = 'unknown (strategy could not be evaluated by Unleash)';
  } else {
    outcome = 'did not match';
  }

  const lines = [`- ${label}: ${outcome}`];
  for (const constraint of strategy.constraints.filter((c) => !c.result)) {
    lines.push(`  - failing constraint: ${formatConstraint(constraint)}`);
  }
  for (const segment of strategy.segments.filter((s) => !s.result)) {
    lines.push(`  - failing segment: ${segment.name}`);
  }
  return lines;
}

function overallResult(feature: PlaygroundFeatureResponse['feature']): string {
  if (feature.strategies.result === 'unknown' && !feature.isEnabled) {
    return 'UNKNOWN (treated as disabled by SDKs; a strategy could not be evaluated)';
  }
  return feature.isEnabled ? 'ENABLED' : 'DISABLED';
}

function resolveEnvironment(input: EvaluateFlagInput, context: ServerContext): string {
  const environment = input.environment ?? context.config.unleash.defaultEnvironment;
  if (!environment) {
    throw new CustomError(
      'MISSING_ENVIRONMENT',
      'No environment was provided to evaluate the flag in.',
      'Pass "environment" (e.g. "development") or set UNLEASH_DEFAULT_ENVIRONMENT.',
    );
  }
  return environment;
}

export async function evaluateFlag(
  context: ServerContext,
  args: unknown,
  progressToken?: string | number,
): Promise<CallToolResult> {
  try {
    const input: EvaluateFlagInput = evaluateFlagSchema.parse(args);
    const environment = resolveEnvironment(input, context);
    const unleashContext = buildUnleashContext(input.context, input.appName);

    await context.notifyProgress(
      progressToken,
      0,
      100,
      `Evaluating "${input.featureName}" in "${environment}"...`,
    );

    let response: PlaygroundFeatureResponse;
    try {
      response = await context.unleashClient.evaluateFeature(input.featureName, {
        environment,
        context: unleashContext,
      });
    } catch (error) {
      if (error instanceof CustomError && error.code === 'HTTP_404' && !error.hint) {
        throw new CustomError(
          error.code,
          error.message,
          'The flag or environment may not exist. Use list_flags to find the flag name.',
        );
      }
      throw error;
    }

    const { feature } = response;

    await context.notifyProgress(
      progressToken,
      100,
      100,
      `Evaluated "${input.featureName}" in "${environment}": ${feature.isEnabled ? 'enabled' : 'disabled'}`,
    );

    const { url, resourceUri } = createFlagLinks(
      context.config.unleash.baseUrl,
      feature.projectId,
      feature.name,
    );

    const messageLines = [
      `Flag "${feature.name}" in "${environment}" evaluates to: ${overallResult(feature)}`,
    ];

    if (feature.variant?.enabled) {
      const payload = feature.variant.payload
        ? ` with ${feature.variant.payload.type} payload ${feature.variant.payload.value}`
        : '';
      messageLines.push(`Variant: ${feature.variant.name}${payload}`);
    }
    if (!feature.isEnabledInCurrentEnvironment) {
      messageLines.push(`Note: the flag is turned off in "${environment}".`);
    }
    if (feature.hasUnsatisfiedDependency) {
      messageLines.push('Note: the flag has a parent dependency that is not satisfied.');
    }

    messageLines.push(`Project: ${feature.projectId}`);

    const strategies = feature.strategies.data;
    messageLines.push(
      strategies.length > 0
        ? `Strategies:\n${strategies.flatMap(summarizeStrategy).join('\n')}`
        : 'Strategies: none configured in this environment.',
    );

    messageLines.push(`Context used: ${JSON.stringify(response.input.context)}`);
    messageLines.push(`View feature: ${url}`);

    context.logger.info(`Evaluated feature "${input.featureName}" in "${environment}"`);

    return {
      content: [
        {
          type: 'text',
          text: messageLines.join('\n'),
        },
      ],
      structuredContent: {
        success: true,
        featureName: feature.name,
        projectId: feature.projectId,
        environment,
        enabled: feature.isEnabled,
        variant: feature.variant,
        evaluation: response,
        links: {
          ui: url,
          resourceUri,
        },
      },
    };
  } catch (error) {
    return handleToolError(context, error, 'evaluate_flag');
  }
}

export const evaluateFlagTool = {
  name: 'evaluate_flag',
  title: 'Evaluate flag',
  annotations: { readOnlyHint: true },
  description:
    'Evaluate a single feature flag against an Unleash context (e.g. userId, custom properties) ' +
    'in an environment, and explain which strategies, constraints and segments matched. ' +
    'Use it to answer "is this flag on for this user?". It returns a runtime result; use ' +
    'get_flag_state for flag configuration and evaluate_change for code-change risk. ' +
    'Backed by an alpha Unleash API that may change.',
  inputSchema: evaluateFlagSchema,
  implementation: evaluateFlag,
};
