import { CustomError } from '../utils/errors.js';
import { diffEventData, type FieldChange } from '../utils/eventDiff.js';
import { VERSION } from '../version.js';
import { buildClientAttribution, type ClientInfo } from './attribution.js';

/**
 * Feature flag types supported by Unleash.
 * See: https://docs.getunleash.io/reference/feature-toggle-types
 */
export type FeatureFlagType =
  | 'release'
  | 'experiment'
  | 'operational'
  | 'kill-switch'
  | 'permission';

/**
 * Request payload for creating a feature flag.
 */
export interface CreateFeatureFlagRequest {
  name: string;
  type: FeatureFlagType;
  description: string;
  impressionData?: boolean;
}

/**
 * Response from the Unleash API when creating a feature flag.
 */
export interface CreateFeatureFlagResponse {
  name: string;
  type: FeatureFlagType;
  description: string;
  project: string;
  createdAt: string;
  archived: boolean;
  impressionData: boolean;
}

export interface UnleashProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  url: string;
}

export interface FeatureFlagSummary {
  name: string;
  description?: string;
  project: string;
  type?: FeatureFlagType;
  archived?: boolean;
  impressionData?: boolean;
  createdAt?: string;
  url: string;
}

export interface FeatureFlagSearchResult {
  total: number;
  flags: Array<{
    name: string;
    project: string;
    type?: FeatureFlagType;
    description?: string | null;
    stale?: boolean;
    environments: Array<{ name: string; enabled: boolean }>;
  }>;
}

export interface StrategyVariantPayload {
  type: 'json' | 'csv' | 'string' | 'number';
  value: string;
}

export interface StrategyVariant {
  name: string;
  weight: number;
  weightType?: 'variable' | 'fix';
  stickiness?: string;
  payload?: StrategyVariantPayload;
  [key: string]: unknown;
}

export const CONSTRAINT_OPERATORS = [
  'IN',
  'NOT_IN',
  'STR_STARTS_WITH',
  'STR_ENDS_WITH',
  'STR_CONTAINS',
  'NUM_EQ',
  'NUM_GT',
  'NUM_GTE',
  'NUM_LT',
  'NUM_LTE',
  'DATE_AFTER',
  'DATE_BEFORE',
  'SEMVER_EQ',
  'SEMVER_GT',
  'SEMVER_GTE',
  'SEMVER_LT',
  'SEMVER_LTE',
  'REGEX',
] as const;

export type ConstraintOperator = (typeof CONSTRAINT_OPERATORS)[number];

export interface StrategyConstraint {
  contextName: string;
  operator: ConstraintOperator;
  values?: string[];
  value?: string;
  inverted?: boolean;
  caseInsensitive?: boolean;
}

export interface FlexibleRolloutStrategy {
  title?: string | null;
  disabled?: boolean | null;
  parameters: Record<string, string>;
  constraints: StrategyConstraint[];
  segments: number[];
  variants?: StrategyVariant[];
}

export interface FeatureStrategy {
  id: string;
  name: string;
  title?: string | null;
  disabled?: boolean | null;
  featureName?: string;
  sortOrder?: number;
  segments?: number[];
  constraints?: StrategyConstraint[];
  variants?: StrategyVariant[];
  parameters: Record<string, string>;
}

export interface Segment {
  id: number;
  name: string;
  description?: string | null;
  project?: string | null;
  constraints: Array<Record<string, unknown>>;
}

export type SegmentSummary = Omit<Segment, 'constraints'>;

export interface ContextField {
  name: string;
  description?: string | null;
  stickiness?: boolean;
  project?: string;
  legalValues?: Array<{ value: string; description?: string }>;
}

export type NewContextField = Omit<ContextField, 'project'>;

export interface NewSegment {
  name: string;
  description?: string;
  project?: string;
  constraints: StrategyConstraint[];
}

export interface FeatureEnvironment {
  name: string;
  enabled: boolean;
  environment?: string;
  type?: string;
  featureName?: string;
  sortOrder?: number;
  variantCount?: number;
  strategies?: FeatureStrategy[];
  variants?: StrategyVariant[];
  lastSeenAt?: string | null;
  hasStrategies?: boolean;
  hasEnabledStrategies?: boolean;
}

export interface FeatureDetails {
  name: string;
  description?: string | null;
  project?: string;
  type?: FeatureFlagType | string;
  archived?: boolean;
  enabled?: boolean;
  stale?: boolean;
  favorite?: boolean;
  impressionData?: boolean;
  createdAt?: string | null;
  archivedAt?: string | null;
  environments?: FeatureEnvironment[];
  tags?: Array<{ type?: string; value?: string }>;
  links?: Array<{ id: string; url: string; title?: string | null }>;
  /** Parent flags this flag depends on. Unleash allows at most one parent. */
  dependencies?: FeatureDependency[];
  /** Names of flags that depend on this flag. */
  children?: string[];
  /** The stage the flag is in now. */
  lifecycle?: FeatureLifecycleEntry;
  [key: string]: unknown;
}

export type FeatureLifecycleStage = 'initial' | 'pre-live' | 'live' | 'completed' | 'archived';

export interface FeatureLifecycleEntry {
  stage: FeatureLifecycleStage;
  /** Detail for the stage, e.g. `kept` or `discarded` for `completed`. */
  status?: string | null;
  enteredStageAt: string;
}

export interface CompleteFeatureRequest {
  status: 'kept' | 'discarded';
  statusValue?: string;
}

export interface ValidateArchiveResult {
  /** Parents whose children would be orphaned because the children aren't archived with them. */
  parentsWithChildFeatures: string[];
  /** Whether archiving would delete any dependency links. */
  hasDeletedDependencies: boolean;
}

export type FeaturePresence = 'active' | 'archived' | 'missing';

export interface FeatureLifecycleSnapshot {
  presence: FeaturePresence;
  stage?: FeatureLifecycleStage;
  status?: string | null;
  stale?: boolean;
}

/**
 * The lifecycle endpoints return no body and some succeed without doing anything, so each
 * mutation reads the flag before and after the call to report what actually changed.
 */
export interface LifecycleTransitionResult {
  /** True when `changes` is not empty. */
  changed: boolean;
  /** The snapshot fields that differ between `before` and `after`. */
  changes: FieldChange[];
  before: FeatureLifecycleSnapshot;
  after: FeatureLifecycleSnapshot;
}

export interface FeatureDependency {
  feature: string;
  enabled?: boolean;
  variants?: string[];
}

/**
 * The Unleash context as modeled in client SDKs.
 * Custom fields go in `properties`; values must be strings.
 */
export interface UnleashContext {
  appName: string;
  userId?: string;
  sessionId?: string;
  remoteAddress?: string;
  currentTime?: string;
  properties?: Record<string, string>;
  [key: string]: unknown;
}

export interface PlaygroundFeatureRequest {
  environment: string;
  context: UnleashContext;
}

export interface PlaygroundVariant {
  name: string;
  enabled: boolean;
  payload?: { type: string; value: string };
}

export interface PlaygroundStrategyVariant {
  name: string;
  enabled: boolean;
  payload?: StrategyVariantPayload;
}

export interface PlaygroundConstraintResult {
  contextName: string;
  operator: string;
  caseInsensitive?: boolean;
  inverted?: boolean;
  values?: string[];
  value?: string;
  result: boolean;
}

export interface PlaygroundSegmentResult {
  id: number;
  name: string;
  result: boolean;
  constraints: PlaygroundConstraintResult[];
}

export type PlaygroundStrategyEvaluation =
  | {
      evaluationStatus: 'complete';
      enabled: boolean;
      variant?: PlaygroundStrategyVariant | null;
      variants?: StrategyVariant[];
    }
  | {
      evaluationStatus: 'incomplete' | 'unevaluated';
      enabled: false | 'unknown';
    };

export interface PlaygroundStrategyResult {
  id: string;
  name: string;
  title?: string;
  result: PlaygroundStrategyEvaluation;
  disabled: boolean | null;
  segments: PlaygroundSegmentResult[];
  constraints: PlaygroundConstraintResult[];
  parameters: Record<string, string>;
  links: { edit: string };
}

export interface PlaygroundFeatureResponse {
  input: PlaygroundFeatureRequest;
  feature: {
    name: string;
    projectId: string;
    isEnabled: boolean;
    isEnabledInCurrentEnvironment: boolean;
    hasUnsatisfiedDependency?: boolean;
    variant: PlaygroundVariant | null;
    variants: StrategyVariant[];
    strategies: {
      result: boolean | 'unknown';
      data: PlaygroundStrategyResult[];
    };
  };
}

/**
 * Minimal Unleash Admin API client focused on feature flag creation.
 * Uses native fetch (Node 18+) for HTTP requests.
 */
export interface FeatureEvent {
  id: number;
  createdAt: string;
  type: string;
  createdBy: string;
  environment?: string | null;
  featureName?: string | null;
  data?: unknown;
  preData?: unknown;
}

export interface FeatureEventsResult {
  events: FeatureEvent[];
  total: number;
}

/** Unleash puts the specific reason in `details` and a generic summary in `message`. */
function errorMessageFrom(rawBody: string, fallback: string): string {
  try {
    const parsed = JSON.parse(rawBody) as {
      message?: string;
      details?: Array<{ message?: string }>;
    };
    const details = Array.isArray(parsed.details)
      ? parsed.details
          .map((detail) => detail.message)
          .filter((detail): detail is string => Boolean(detail))
      : [];
    return details.length > 0 ? details.join(', ') : (parsed.message ?? fallback);
  } catch {
    return rawBody && rawBody.length < 200 ? `${fallback}: ${rawBody}` : fallback;
  }
}

export class UnleashClient {
  private readonly baseUrl: string;
  private readonly authHeaders: Record<string, string>;
  private readonly dryRun: boolean;
  private readonly getClientInfo?: () => ClientInfo | undefined;
  private readonly attributionEnabled: boolean;

  constructor(
    baseUrl: string,
    authHeaders: Record<string, string>,
    dryRun: boolean = false,
    getClientInfo?: () => ClientInfo | undefined,
    attributionEnabled: boolean = true,
  ) {
    // Ensure baseUrl doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authHeaders = authHeaders;
    this.dryRun = dryRun;
    this.getClientInfo = getClientInfo;
    this.attributionEnabled = attributionEnabled;
  }

  /**
   * Create a feature flag in the specified project.
   * Endpoint: POST /api/admin/projects/{projectId}/features
   *
   * @param projectId - The project ID where the flag will be created
   * @param request - Feature flag details
   * @returns The created feature flag response
   * @throws CustomError if the request fails
   */
  async createFeatureFlag(
    projectId: string,
    request: CreateFeatureFlagRequest,
  ): Promise<CreateFeatureFlagResponse> {
    if (this.dryRun) {
      // In dry-run mode, return a mock response
      return {
        name: request.name,
        type: request.type,
        description: request.description,
        project: projectId,
        createdAt: new Date().toISOString(),
        archived: false,
        impressionData: request.impressionData ?? false,
      };
    }

    return this.requestJson<CreateFeatureFlagResponse>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      {
        errorMessage: 'Failed to create feature flag',
      },
    );
  }

  async listProjects(): Promise<UnleashProjectSummary[]> {
    if (this.dryRun) {
      return [
        {
          id: 'default',
          name: 'Default (dry run)',
          description:
            'Dry-run mode placeholder. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real projects.',
          createdAt: new Date().toISOString(),
          url: `${this.baseUrl}/projects/default`,
        },
      ];
    }

    const data = await this.requestJson<{
      projects?: Array<{
        id?: string;
        name?: string;
        description?: string;
        createdAt?: string;
        url?: string;
      }>;
    }>(
      '/api/admin/projects?view=core',
      { method: 'GET' },
      {
        errorMessage: 'Failed to list projects',
        networkErrorMessage: 'Failed to connect to Unleash API while listing projects',
      },
    );

    if (!Array.isArray(data.projects)) {
      return [];
    }

    return data.projects.map((project) => {
      const id = project.id ?? project.name ?? 'unknown-project';
      return {
        id,
        name: project.name ?? project.id ?? 'Unnamed project',
        description: project.description,
        createdAt: project.createdAt ?? new Date(0).toISOString(),
        url: project.url ?? `${this.baseUrl}/projects/${encodeURIComponent(id)}`,
      };
    });
  }

  async listFeatureFlags(
    projectId: string,
    options: { archived?: boolean } = {},
  ): Promise<FeatureFlagSummary[]> {
    const archived = options.archived === true;

    if (this.dryRun) {
      if (archived) {
        return [
          {
            name: 'dry-run-placeholder-archived-flag',
            description:
              'Dry-run mode placeholder for an archived flag. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real archived flags.',
            project: projectId,
            type: 'release',
            archived: true,
            impressionData: false,
            url: `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/features/dry-run-placeholder-archived-flag`,
          },
        ];
      }
      return [
        {
          name: 'dry-run-placeholder-flag',
          description:
            'Dry-run mode placeholder. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real feature flags.',
          project: projectId,
          type: 'release',
          archived: false,
          impressionData: false,
          url: `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/features/dry-run-placeholder-flag`,
        },
      ];
    }

    return archived
      ? this.fetchArchivedProjectFeatureFlags(projectId)
      : this.fetchProjectFeatureFlags(projectId);
  }

  async addFlexibleRolloutStrategy(
    projectId: string,
    featureName: string,
    environment: string,
    strategy: FlexibleRolloutStrategy,
  ): Promise<FeatureStrategy> {
    const payload = { name: 'flexibleRollout', ...strategy };

    if (this.dryRun) {
      return { id: 'dry-run-strategy', featureName, ...payload };
    }

    return this.requestJson<FeatureStrategy>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/strategies`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      {
        errorMessage: `Failed to add a flexibleRollout strategy to feature ${featureName} in ${environment}`,
        networkErrorMessage: `Failed to connect to Unleash API while configuring strategy for feature ${featureName}`,
      },
    );
  }

  /** Unleash replaces the whole strategy, so `strategy` must carry every field to keep. */
  async replaceFlexibleRolloutStrategy(
    projectId: string,
    featureName: string,
    environment: string,
    strategyId: string,
    strategy: FlexibleRolloutStrategy,
  ): Promise<FeatureStrategy> {
    const payload = { name: 'flexibleRollout', ...strategy };

    if (this.dryRun) {
      return { id: strategyId, featureName, ...payload };
    }

    return this.requestJson<FeatureStrategy>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/strategies/${encodeURIComponent(strategyId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      {
        errorMessage: `Failed to update strategy ${strategyId} of feature ${featureName} in ${environment}`,
        networkErrorMessage: `Failed to connect to Unleash API while configuring strategy for feature ${featureName}`,
      },
    );
  }

  /** Checks value formats and the field's legal values with Unleash's own rules. */
  async validateConstraint(constraint: StrategyConstraint): Promise<void> {
    if (this.dryRun) {
      return;
    }

    await this.request(
      '/api/admin/constraints/validate',
      { method: 'POST', body: JSON.stringify(constraint) },
      {
        errorMessage: `Invalid constraint on ${constraint.contextName}`,
        networkErrorMessage: 'Failed to connect to Unleash API while validating a constraint',
      },
    );
  }

  async getFeature(projectId: string, featureName: string): Promise<FeatureDetails> {
    if (this.dryRun) {
      return {
        name: featureName,
        project: projectId,
        type: 'release',
        description: `Dry-run feature summary for ${featureName}`,
        enabled: false,
        archived: false,
        impressionData: false,
        stale: false,
        createdAt: new Date().toISOString(),
        lifecycle: { stage: 'initial', enteredStageAt: new Date().toISOString() },
        environments: [
          {
            name: 'development',
            environment: 'development',
            featureName,
            enabled: false,
            strategies: [],
            variants: [],
            hasStrategies: false,
            hasEnabledStrategies: false,
          },
        ],
      };
    }

    return this.requestJson<FeatureDetails>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}`,
      {
        method: 'GET',
      },
      {
        errorMessage: `Failed to fetch feature ${featureName} in project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching feature ${featureName}`,
      },
    );
  }

  /**
   * Keeps what defines a segment; Unleash also returns its creator and how often it is used.
   */
  async getSegment(id: number): Promise<Segment> {
    if (this.dryRun) {
      return { id, name: `Dry-run segment ${id}`, constraints: [] };
    }

    const { name, description, project, constraints } = await this.requestJson<Segment>(
      `/api/admin/segments/${id}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch segment ${id}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching segment ${id}`,
      },
    );
    return { id, name, description, project, constraints };
  }

  /** Leaves out segment constraints, which can hold many values each. */
  async listSegments(): Promise<SegmentSummary[]> {
    if (this.dryRun) {
      return [{ id: 1, name: 'Dry-run segment', project: null }];
    }

    const { segments } = await this.requestJson<{ segments: Segment[] }>(
      '/api/admin/segments',
      { method: 'GET' },
      {
        errorMessage: 'Failed to list segments',
        networkErrorMessage: 'Failed to connect to Unleash API while listing segments',
      },
    );
    return segments.map(({ id, name, description, project }) => ({
      id,
      name,
      description,
      project,
    }));
  }

  /**
   * Context fields that constraints in `projectId` can use: the root fields plus the project's
   * own, or only the root fields without `projectId`. Keeps what a constraint needs; Unleash also
   * returns usage counts and sort order.
   */
  async getContextFields(projectId?: string): Promise<ContextField[]> {
    if (this.dryRun) {
      return [{ name: 'userId', stickiness: true, legalValues: [] }];
    }

    const fields = await this.requestJson<ContextField[]>(
      projectId
        ? `/api/admin/projects/${encodeURIComponent(projectId)}/context?include=root`
        : '/api/admin/context',
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch context fields${projectId ? ` for project ${projectId}` : ''}`,
        networkErrorMessage: 'Failed to connect to Unleash API while fetching context fields',
      },
    );
    return fields.map(({ name, description, stickiness, project, legalValues }) => ({
      name,
      description,
      stickiness,
      project,
      legalValues,
    }));
  }

  /**
   * Creates a context field. With `projectId` it belongs to that project (Unleash 7.4.0 and later),
   * without it the field is global.
   */
  async createContextField(field: NewContextField, projectId?: string): Promise<ContextField> {
    if (this.dryRun) {
      return { ...field, project: projectId };
    }

    const path = projectId
      ? `/api/admin/projects/${encodeURIComponent(projectId)}/context`
      : '/api/admin/context';
    const { name, description, stickiness, project, legalValues } =
      await this.requestJson<ContextField>(
        path,
        { method: 'POST', body: JSON.stringify(field) },
        {
          errorMessage: `Failed to create context field ${field.name}`,
          networkErrorMessage: `Failed to connect to Unleash API while creating context field ${field.name}`,
        },
      );
    return { name, description, stickiness, project, legalValues };
  }

  /** The context field with this name, whichever project owns it, or undefined when none exists. */
  async findContextField(name: string): Promise<ContextField | undefined> {
    if (this.dryRun) return undefined;

    try {
      return await this.requestJson<ContextField>(
        `/api/admin/context/${encodeURIComponent(name)}`,
        { method: 'GET' },
        {
          errorMessage: `Failed to fetch context field ${name}`,
          networkErrorMessage: `Failed to connect to Unleash API while fetching context field ${name}`,
        },
      );
    } catch (error) {
      if (error instanceof CustomError && error.code === 'HTTP_404') return undefined;
      throw error;
    }
  }

  /** Creates a segment in `project`, or a global one when `project` is left out. */
  async createSegment(segment: NewSegment): Promise<Segment> {
    if (this.dryRun) {
      return { id: 0, ...segment, constraints: [] };
    }

    const { id, name, description, project, constraints } = await this.requestJson<Segment>(
      '/api/admin/segments',
      { method: 'POST', body: JSON.stringify(segment) },
      {
        errorMessage: `Failed to create segment ${segment.name}`,
        networkErrorMessage: `Failed to connect to Unleash API while creating segment ${segment.name}`,
      },
    );
    return { id, name, description, project, constraints };
  }

  /**
   * Fetch the most recent change events for a single feature flag, newest first.
   * Endpoint: GET /api/admin/search/events?feature=IS:{name}&limit={limit}
   *
   * Returns the raw events including `preData`/`data`; the caller computes the diff.
   */
  async getFeatureEvents(featureName: string, limit: number): Promise<FeatureEventsResult> {
    if (this.dryRun) {
      return {
        total: 1,
        events: [
          {
            id: 1,
            createdAt: new Date().toISOString(),
            type: 'feature-strategy-update',
            createdBy: 'dry-run@example.com',
            environment: 'development',
            featureName,
            preData: { parameters: { rollout: '50' } },
            data: { parameters: { rollout: '100' } },
          },
        ],
      };
    }

    const params = new URLSearchParams({
      feature: `IS:${featureName}`,
      limit: String(limit),
      offset: '0',
    });

    return this.requestJson<FeatureEventsResult>(
      `/api/admin/search/events?${params.toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch events for feature ${featureName}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching events for ${featureName}`,
      },
    );
  }

  /**
   * Flags in the same project that can become the parent of `childFeature`. The API excludes
   * the child itself, archived flags and flags that already have a parent. It does not check
   * whether `childFeature` can take a parent (it must have no parent and no children).
   */
  async getParentFeatureOptions(projectId: string, childFeature: string): Promise<string[]> {
    if (this.dryRun) {
      return ['dry-run-parent-a', 'dry-run-parent-b'];
    }

    return this.requestJson<string[]>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(childFeature)}/parents`,
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch parent options for ${childFeature} in project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching parent options for ${childFeature}`,
      },
    );
  }

  /**
   * Variant names a dependency on `parentFeature` can require. Includes both feature environment
   * variants and strategy variants across all environments.
   */
  async getParentVariantOptions(projectId: string, parentFeature: string): Promise<string[]> {
    if (this.dryRun) {
      return ['dry-run-variant-a', 'dry-run-variant-b'];
    }

    return this.requestJson<string[]>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(parentFeature)}/parent-variants`,
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch parent variant options for ${parentFeature} in project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching parent variant options for ${parentFeature}`,
      },
    );
  }

  /**
   * Search active flags in all projects by part of their name or description. Keeps only the
   * fields an agent needs to pick a flag; search also returns tags, lifecycle, creator and more.
   */
  async searchFeatureFlags(query: string): Promise<FeatureFlagSearchResult> {
    if (this.dryRun) {
      return { total: 0, flags: [] };
    }

    const data = await this.requestJson<{
      total: number;
      features: Array<FeatureFlagSearchResult['flags'][number]>;
    }>(
      `/api/admin/search/features?${new URLSearchParams({ query }).toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to search feature flags for "${query}"`,
        networkErrorMessage: 'Failed to connect to Unleash API while searching feature flags',
      },
    );

    const flags = data.features.map((flag) => ({
      name: flag.name,
      project: flag.project,
      type: flag.type,
      description: flag.description,
      stale: flag.stale,
      environments: flag.environments.map(({ name, enabled }) => ({ name, enabled })),
    }));
    return { total: data.total, flags };
  }

  /**
   * Flag names are unique across projects, so the name alone identifies the project. Search
   * leaves out archived flags unless asked for them, so they are looked up second.
   */
  async findFeatureProject(featureName: string): Promise<string | undefined> {
    if (this.dryRun) {
      return 'default';
    }

    const activeProject = await this.searchProjectOf(featureName, {});
    return activeProject ?? this.searchProjectOf(featureName, { archived: 'IS:true' });
  }

  private async searchProjectOf(
    featureName: string,
    filters: Record<string, string>,
  ): Promise<string | undefined> {
    const params = new URLSearchParams({ query: featureName, ...filters });
    const data = await this.requestJson<{ features?: Array<{ name?: string; project?: string }> }>(
      `/api/admin/search/features?${params.toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to look up the project of feature ${featureName}`,
        networkErrorMessage: `Failed to connect to Unleash API while looking up feature ${featureName}`,
      },
    );
    return data.features?.find((feature) => feature.name === featureName)?.project;
  }

  /**
   * Evaluate a single feature flag against a context in an environment
   * (alpha playground endpoint). The project is resolved server-side.
   */
  async evaluateFeature(
    featureName: string,
    request: PlaygroundFeatureRequest,
  ): Promise<PlaygroundFeatureResponse> {
    if (this.dryRun) {
      return {
        input: request,
        feature: {
          name: featureName,
          projectId: 'default',
          isEnabled: false,
          isEnabledInCurrentEnvironment: false,
          hasUnsatisfiedDependency: false,
          variant: { name: 'disabled', enabled: false },
          variants: [],
          strategies: { result: false, data: [] },
        },
      };
    }

    return this.requestJson<PlaygroundFeatureResponse>(
      `/api/admin/playground/features/${encodeURIComponent(featureName)}`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      {
        errorMessage: `Failed to evaluate feature ${featureName} in ${request.environment}`,
        networkErrorMessage: `Failed to connect to Unleash API while evaluating feature ${featureName}`,
      },
    );
  }

  async deleteFeatureStrategy(
    projectId: string,
    featureName: string,
    environment: string,
    strategyId: string,
  ): Promise<void> {
    if (this.dryRun) {
      return;
    }

    const path = `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/strategies/${encodeURIComponent(strategyId)}`;
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = this.buildRequestHeaders();

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        const message = errorMessageFrom(
          rawBody,
          `Failed to delete strategy ${strategyId} from feature ${featureName} in ${environment}: ${response.status} ${response.statusText}`,
        );

        throw new CustomError(`HTTP_${response.status}`, message);
      }
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const hint = `Check that UNLEASH_BASE_URL (${this.baseUrl}) is reachable.`;

        throw new CustomError(
          'NETWORK_ERROR',
          `Failed to connect to Unleash API while deleting strategy for feature ${featureName}`,
          hint,
        );
      }

      throw error;
    }
  }

  async toggleFeatureEnvironment(
    projectId: string,
    featureName: string,
    environment: string,
    enabled: boolean,
    { activateDisabledStrategies = false }: { activateDisabledStrategies?: boolean } = {},
  ): Promise<void> {
    if (this.dryRun) {
      return;
    }

    // Unleash turns on every disabled strategy instead of adding its default one.
    const query = activateDisabledStrategies ? '?shouldActivateDisabledStrategies=true' : '';
    const path = `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/${enabled ? 'on' : 'off'}${query}`;

    await this.request(
      path,
      {
        method: 'POST',
      },
      {
        errorMessage: `Failed to turn ${enabled ? 'on' : 'off'} feature ${featureName} in ${environment}`,
        networkErrorMessage: `Failed to connect to Unleash API while toggling feature ${featureName}`,
      },
    );
  }

  /**
   * One entry per lifecycle stage the flag has entered, oldest first.
   */
  async getFeatureLifecycle(
    projectId: string,
    featureName: string,
  ): Promise<FeatureLifecycleEntry[]> {
    if (this.dryRun) {
      return [{ stage: 'initial', enteredStageAt: new Date().toISOString() }];
    }

    return this.requestJson<FeatureLifecycleEntry[]>(
      `${this.featurePath(projectId, featureName)}/lifecycle`,
      { method: 'GET' },
      {
        errorMessage: `Failed to fetch lifecycle for feature ${featureName} in project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while fetching lifecycle for feature ${featureName}`,
      },
    );
  }

  /**
   * Report which dependency links archiving `featureNames` would break, without archiving.
   */
  async validateArchiveFeatures(
    projectId: string,
    featureNames: string[],
  ): Promise<ValidateArchiveResult> {
    if (this.dryRun) {
      return { parentsWithChildFeatures: [], hasDeletedDependencies: false };
    }

    return this.requestJson<ValidateArchiveResult>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/archive/validate`,
      { method: 'POST', body: JSON.stringify({ features: featureNames }) },
      {
        errorMessage: `Failed to validate archiving ${featureNames.join(', ')} in project ${projectId}`,
        networkErrorMessage: 'Failed to connect to Unleash API while validating archive',
      },
    );
  }

  async completeFeature(
    projectId: string,
    featureName: string,
    request: CompleteFeatureRequest,
  ): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'active', stage: 'live', stale: false },
        { presence: 'active', stage: 'completed', status: request.status, stale: false },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        `${this.featurePath(projectId, featureName)}/lifecycle/complete`,
        { method: 'POST', body: JSON.stringify(request) },
        {
          errorMessage: `Failed to complete feature ${featureName}`,
          networkErrorMessage: `Failed to connect to Unleash API while completing feature ${featureName}`,
        },
      ),
    );
  }

  async uncompleteFeature(
    projectId: string,
    featureName: string,
  ): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'active', stage: 'completed', status: 'kept', stale: false },
        { presence: 'active', stage: 'live', stale: false },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        `${this.featurePath(projectId, featureName)}/lifecycle/uncomplete`,
        { method: 'POST' },
        {
          errorMessage: `Failed to uncomplete feature ${featureName}`,
          networkErrorMessage: `Failed to connect to Unleash API while uncompleting feature ${featureName}`,
        },
      ),
    );
  }

  /**
   * Archive the flag. The API uses DELETE on the feature path, but the flag is only archived.
   */
  async archiveFeature(projectId: string, featureName: string): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'active', stage: 'initial', stale: false },
        { presence: 'archived', stage: 'archived', stale: false },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        this.featurePath(projectId, featureName),
        { method: 'DELETE' },
        {
          errorMessage: `Failed to archive feature ${featureName}`,
          networkErrorMessage: `Failed to connect to Unleash API while archiving feature ${featureName}`,
        },
      ),
    );
  }

  /**
   * The revive path has no project; `projectId` is used to read the flag before and after.
   */
  async reviveFeature(projectId: string, featureName: string): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'archived', stage: 'archived', stale: false },
        { presence: 'active', stage: 'initial', stale: false },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        `/api/admin/archive/revive/${encodeURIComponent(featureName)}`,
        { method: 'POST' },
        {
          errorMessage: `Failed to revive feature ${featureName}`,
          networkErrorMessage: `Failed to connect to Unleash API while reviving feature ${featureName}`,
        },
      ),
    );
  }

  /**
   * Permanently delete an archived flag. The API succeeds without deleting anything when the
   * flag is not archived, which shows up here as `changed: false`. The delete path has no
   * project; `projectId` is used to read the flag before and after.
   */
  async deleteArchivedFeature(
    projectId: string,
    featureName: string,
  ): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'archived', stage: 'archived', stale: false },
        { presence: 'missing' },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        `/api/admin/archive/${encodeURIComponent(featureName)}`,
        { method: 'DELETE' },
        {
          errorMessage: `Failed to delete feature ${featureName}`,
          networkErrorMessage: `Failed to connect to Unleash API while deleting feature ${featureName}`,
        },
      ),
    );
  }

  /**
   * Unleash has no single-flag stale endpoint, so this calls the batch one with one name.
   * The batch endpoint ignores flags that don't exist.
   */
  async setFeatureStale(
    projectId: string,
    featureName: string,
    stale: boolean,
  ): Promise<LifecycleTransitionResult> {
    if (this.dryRun) {
      return this.dryRunTransition(
        { presence: 'active', stage: 'live', stale: !stale },
        { presence: 'active', stage: 'live', stale },
      );
    }

    return this.transition(projectId, featureName, () =>
      this.request(
        `/api/admin/projects/${encodeURIComponent(projectId)}/stale`,
        { method: 'POST', body: JSON.stringify({ features: [featureName], stale }) },
        {
          errorMessage: `Failed to mark feature ${featureName} as ${stale ? 'stale' : 'not stale'}`,
          networkErrorMessage: `Failed to connect to Unleash API while updating stale for feature ${featureName}`,
        },
      ),
    );
  }

  private featurePath(projectId: string, featureName: string): string {
    return `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}`;
  }

  private async transition(
    projectId: string,
    featureName: string,
    mutate: () => Promise<void>,
  ): Promise<LifecycleTransitionResult> {
    const before = await this.getLifecycleSnapshot(projectId, featureName);
    if (before.presence === 'missing') {
      throw new CustomError(
        'FLAG_NOT_FOUND',
        `No flag named "${featureName}" exists in project "${projectId}", active or archived.`,
        'Search for the flag by name to find its exact name and project.',
      );
    }
    await mutate();
    const after = await this.getLifecycleSnapshot(projectId, featureName);
    return compareSnapshots(before, after);
  }

  private dryRunTransition(
    before: FeatureLifecycleSnapshot,
    after: FeatureLifecycleSnapshot,
  ): LifecycleTransitionResult {
    return compareSnapshots(before, after);
  }

  /**
   * Where the flag is now. Falls back to searching archived flags when the feature endpoint
   * returns 404, since that endpoint may not serve archived flags.
   */
  private async getLifecycleSnapshot(
    projectId: string,
    featureName: string,
  ): Promise<FeatureLifecycleSnapshot> {
    try {
      const feature = await this.getFeature(projectId, featureName);
      if (feature.archived) {
        return { presence: 'archived', stage: 'archived', stale: feature.stale };
      }
      return {
        presence: 'active',
        stage: feature.lifecycle?.stage,
        status: feature.lifecycle?.status,
        stale: feature.stale,
      };
    } catch (error) {
      if (!(error instanceof CustomError) || error.code !== 'HTTP_404') {
        throw error;
      }
    }

    const params = new URLSearchParams({
      project: `IS:${projectId}`,
      archived: 'IS:true',
      query: featureName,
    });
    const data = await this.requestJson<{
      features?: Array<{ name?: string; stale?: boolean }>;
    }>(
      `/api/admin/search/features?${params.toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to look up archived feature ${featureName} in project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while looking up feature ${featureName}`,
      },
    );

    const archived = data.features?.find((feature) => feature.name === featureName);
    return archived
      ? { presence: 'archived', stage: 'archived', stale: archived.stale }
      : { presence: 'missing' };
  }

  private async fetchProjectFeatureFlags(projectId: string): Promise<FeatureFlagSummary[]> {
    const data = await this.requestJson<{
      features?: Array<{
        name?: string;
        description?: string;
        type?: FeatureFlagType;
        archived?: boolean;
        impressionData?: boolean;
        createdAt?: string;
        project?: string;
      }>;
    }>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features?view=core`,
      { method: 'GET' },
      {
        errorMessage: `Failed to list feature flags for project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while listing flags for project ${projectId}`,
      },
    );

    return (data.features ?? [])
      .filter((f) => f.name)
      .map((feature) => {
        const name = feature.name as string;
        const project = feature.project ?? projectId;
        return {
          name,
          description: feature.description,
          project,
          type: feature.type,
          archived: feature.archived,
          impressionData: feature.impressionData,
          createdAt: feature.createdAt,
          url: `${this.baseUrl}/projects/${encodeURIComponent(project)}/features/${encodeURIComponent(name)}`,
        };
      });
  }

  /**
   * Fetch archived feature flags for a project.
   *
   * The project-features endpoint (`/api/admin/projects/{id}/features`) returns
   * only non-archived flags — its controller doesn't extract the `archived` query
   * parameter. Archived flags must be fetched via the search endpoint, which
   * accepts the Unleash search syntax (`archived=IS:true`).
   */
  private async fetchArchivedProjectFeatureFlags(projectId: string): Promise<FeatureFlagSummary[]> {
    const params = new URLSearchParams({
      project: `IS:${projectId}`,
      archived: 'IS:true',
    });

    const data = await this.requestJson<{
      features?: Array<{
        name?: string;
        description?: string;
        type?: FeatureFlagType;
        archived?: boolean;
        impressionData?: boolean;
        createdAt?: string;
        project?: string;
      }>;
    }>(
      `/api/admin/search/features?${params.toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to list archived feature flags for project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while listing archived flags for project ${projectId}`,
      },
    );

    return (data.features ?? [])
      .filter((f) => f.name)
      .map((feature) => {
        const name = feature.name as string;
        const project = feature.project ?? projectId;
        return {
          name,
          description: feature.description,
          project,
          type: feature.type,
          // The search endpoint may not always set `archived: true` explicitly
          // since the filter already narrowed the result set — assert it here.
          archived: true,
          impressionData: feature.impressionData,
          createdAt: feature.createdAt,
          url: `${this.baseUrl}/projects/${encodeURIComponent(project)}/features/${encodeURIComponent(name)}`,
        };
      });
  }

  /**
   * Validate that a project exists (placeholder for future use).
   * Not implemented yet, but reserved for validation logic.
   */
  async validateProject(_projectId: string): Promise<boolean> {
    // TODO: Implement project validation if needed
    // For now, we'll rely on the create endpoint to fail if project doesn't exist
    return true;
  }

  /**
   * Build default headers for outbound Unleash Admin API calls.
   * Adds identity metadata so Unleash can attribute MCP traffic.
   */
  private buildRequestHeaders(): Record<string, string> {
    let attribution = '';
    try {
      const info = this.attributionEnabled ? this.getClientInfo?.() : undefined;
      attribution = buildClientAttribution(info, this.attributionEnabled);
    } catch {
      attribution = '';
    }

    const userAgent = attribution
      ? `unleash-mcp/${VERSION} (MCP Server; ${attribution})`
      : `unleash-mcp/${VERSION} (MCP Server)`;

    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.authHeaders,
      'X-Unleash-AppName': 'unleash-mcp',
      'User-Agent': userAgent,
    };
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    options: {
      errorMessage: string;
      networkErrorMessage?: string;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = {
      ...this.buildRequestHeaders(),
      ...(init.headers ? (init.headers as Record<string, string>) : {}),
    };

    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        const message = errorMessageFrom(
          rawBody,
          `${options.errorMessage}: ${response.status} ${response.statusText}`,
        );

        throw new CustomError(`HTTP_${response.status}`, message);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const hint = `Check that UNLEASH_BASE_URL (${this.baseUrl}) is reachable.`;

        throw new CustomError(
          'NETWORK_ERROR',
          options.networkErrorMessage ?? 'Failed to connect to Unleash API',
          hint,
        );
      }

      throw error;
    }
  }

  /**
   * Requests without expecting a JSON response.
   *
   */
  private async request(
    path: string,
    init: RequestInit,
    options: {
      errorMessage: string;
      networkErrorMessage?: string;
    },
  ): Promise<void> {
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = {
      ...this.buildRequestHeaders(),
      ...(init.headers ? (init.headers as Record<string, string>) : {}),
    };

    try {
      const response = await fetch(url, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const rawBody = await response.text();
        const message = errorMessageFrom(
          rawBody,
          `${options.errorMessage}: ${response.status} ${response.statusText}`,
        );

        throw new CustomError(`HTTP_${response.status}`, message);
      }

      return;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        const hint = `Check that UNLEASH_BASE_URL (${this.baseUrl}) is reachable.`;

        throw new CustomError(
          'NETWORK_ERROR',
          options.networkErrorMessage ?? 'Failed to connect to Unleash API',
          hint,
        );
      }

      throw error;
    }
  }
}

function compareSnapshots(
  before: FeatureLifecycleSnapshot,
  after: FeatureLifecycleSnapshot,
): LifecycleTransitionResult {
  const compactBefore = withoutEmptyFields(before);
  const compactAfter = withoutEmptyFields(after);
  const changes = diffEventData(compactBefore, compactAfter);
  return { changed: changes.length > 0, changes, before: compactBefore, after: compactAfter };
}

/**
 * Drops `undefined` and `null` fields so an absent status and a `null` status don't diff as a
 * change.
 */
function withoutEmptyFields(snapshot: FeatureLifecycleSnapshot): FeatureLifecycleSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== undefined && value !== null),
  ) as FeatureLifecycleSnapshot;
}
