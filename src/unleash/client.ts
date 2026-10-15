import { CustomError } from '../utils/errors.js';
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

export interface SetFlagRolloutOptions {
  rolloutPercentage: number;
  groupId?: string;
  stickiness?: string;
  title?: string;
  disabled?: boolean;
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
  constraints?: Array<Record<string, unknown>>;
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
  [key: string]: unknown;
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

  async setFlexibleRolloutStrategy(
    projectId: string,
    featureName: string,
    environment: string,
    options: SetFlagRolloutOptions,
  ): Promise<FeatureStrategy> {
    const rollout = Math.min(100, Math.max(0, options.rolloutPercentage));
    const parameters: Record<string, string> = {
      rollout: rollout.toString(),
      groupId: options.groupId ?? featureName,
      stickiness: options.stickiness ?? 'default',
    };

    const payload = {
      name: 'flexibleRollout',
      title: options.title,
      disabled: options.disabled,
      parameters,
      ...(options.variants && options.variants.length > 0 ? { variants: options.variants } : {}),
    };

    if (this.dryRun) {
      return {
        id: 'dry-run-strategy',
        name: payload.name,
        title: payload.title ?? null,
        disabled: payload.disabled ?? false,
        featureName,
        parameters,
        variants: payload.variants ?? [],
      };
    }

    return this.requestJson<FeatureStrategy>(
      `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/strategies`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      {
        errorMessage: `Failed to configure flexibleRollout strategy for feature ${featureName} in ${environment}`,
        networkErrorMessage: `Failed to connect to Unleash API while configuring strategy for feature ${featureName}`,
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
        let message = `Failed to delete strategy ${strategyId} from feature ${featureName} in ${environment}: ${response.status} ${response.statusText}`;

        try {
          const parsed = JSON.parse(rawBody) as {
            message?: string;
            details?: Array<{ message?: string }>;
          };

          if (parsed.message) {
            message = parsed.message;
          } else if (parsed.details && Array.isArray(parsed.details)) {
            const detailMessages = parsed.details
              .map((detail) => detail.message)
              .filter((detail): detail is string => Boolean(detail));

            if (detailMessages.length > 0) {
              message = detailMessages.join(', ');
            }
          }
        } catch {
          if (rawBody && rawBody.length < 200) {
            message += `: ${rawBody}`;
          }
        }

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
  ): Promise<void> {
    if (this.dryRun) {
      return;
    }

    const path = `/api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}/environments/${encodeURIComponent(environment)}/${enabled ? 'on' : 'off'}`;

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
        let message = `${options.errorMessage}: ${response.status} ${response.statusText}`;

        try {
          const parsed = JSON.parse(rawBody) as {
            message?: string;
            details?: Array<{ message?: string }>;
          };

          if (parsed.message) {
            message = parsed.message;
          } else if (parsed.details && Array.isArray(parsed.details)) {
            const detailMessages = parsed.details
              .map((detail) => detail.message)
              .filter((detail): detail is string => Boolean(detail));

            if (detailMessages.length > 0) {
              message = detailMessages.join(', ');
            }
          }
        } catch {
          if (rawBody && rawBody.length < 200) {
            message += `: ${rawBody}`;
          }
        }

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
        let message = `${options.errorMessage}: ${response.status} ${response.statusText}`;

        try {
          const parsed = JSON.parse(rawBody) as {
            message?: string;
            details?: Array<{ message?: string }>;
          };

          if (parsed.message) {
            message = parsed.message;
          } else if (parsed.details && Array.isArray(parsed.details)) {
            const detailMessages = parsed.details
              .map((detail) => detail.message)
              .filter((detail): detail is string => Boolean(detail));

            if (detailMessages.length > 0) {
              message = detailMessages.join(', ');
            }
          }
        } catch {
          if (rawBody && rawBody.length < 200) {
            message += `: ${rawBody}`;
          }
        }

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
