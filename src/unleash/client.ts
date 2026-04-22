import { CustomError } from '../utils/errors.js';
import { VERSION } from '../version.js';

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
  mode?: string;
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

export interface FeatureExposureRow {
  receivedAt: string;
  timestamp: string;
  eventId: string;
  featureName: string;
  enabled: boolean | null;
  variant: string | null;
  userId: string | null;
  sessionId: string | null;
  environment: string;
  appName: string;
  project: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface FeatureExposuresResponse {
  rows: FeatureExposureRow[];
  truncated: boolean;
}

export interface GetFeatureExposuresParams {
  from: string;
  to: string;
  featureName?: string;
  variant?: string;
  enabled?: boolean;
  userId?: string;
  sessionId?: string;
  environment?: string;
  appName?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

export type FeatureExposureSummaryBucket = 'none' | 'hour' | 'day';

export interface FeatureExposureSummaryRow {
  bucket?: string;
  featureName: string;
  variant: string | null;
  enabled: boolean | null;
  exposures: number;
  distinctUsers: number;
  distinctSessions: number;
}

export interface FeatureExposureSummaryResponse {
  rows: FeatureExposureSummaryRow[];
}

export interface GetFeatureExposureSummaryParams {
  from: string;
  to: string;
  bucket?: FeatureExposureSummaryBucket;
  featureName?: string;
  variant?: string;
  enabled?: boolean;
  userId?: string;
  sessionId?: string;
  environment?: string;
  appName?: string;
  project?: string;
  limit?: number;
}

export interface CustomEventRow {
  receivedAt: string;
  timestamp: string;
  eventId: string;
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  environment: string | null;
  appName: string | null;
  project: string | null;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface CustomEventsResponse {
  rows: CustomEventRow[];
  truncated: boolean;
}

export interface GetCustomEventsParams {
  from: string;
  to: string;
  eventName?: string;
  userId?: string;
  sessionId?: string;
  environment?: string;
  appName?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

export type TopImpressionEventsGroupBy =
  | 'featureName'
  | 'variant'
  | 'eventName'
  | 'eventType'
  | 'userId'
  | 'sessionId'
  | 'appName'
  | 'environment';

export interface TopImpressionEventsRow {
  key: string;
  count: number;
}

export interface TopImpressionEventsResponse {
  groupBy: TopImpressionEventsGroupBy;
  rows: TopImpressionEventsRow[];
}

export interface GetTopImpressionEventsParams {
  from: string;
  to: string;
  groupBy: TopImpressionEventsGroupBy;
  featureName?: string;
  eventName?: string;
  variant?: string;
  enabled?: boolean;
  userId?: string;
  sessionId?: string;
  environment?: string;
  appName?: string;
  project?: string;
  limit?: number;
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
  [key: string]: unknown;
}

/**
 * Minimal Unleash Admin API client focused on feature flag creation.
 * Uses native fetch (Node 18+) for HTTP requests.
 */
export class UnleashClient {
  private readonly baseUrl: string;
  private readonly authHeaders: Record<string, string>;
  private readonly dryRun: boolean;

  constructor(baseUrl: string, authHeaders: Record<string, string>, dryRun: boolean = false) {
    // Ensure baseUrl doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authHeaders = authHeaders;
    this.dryRun = dryRun;
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
        mode?: string;
        createdAt?: string;
        url?: string;
      }>;
    }>(
      '/api/admin/projects',
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
        mode: project.mode,
        createdAt: project.createdAt ?? new Date(0).toISOString(),
        url: project.url ?? `${this.baseUrl}/projects/${encodeURIComponent(id)}`,
      };
    });
  }

  async listFeatureFlags(projectId: string): Promise<FeatureFlagSummary[]> {
    if (this.dryRun) {
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

    return this.fetchProjectFeatureFlags(projectId);
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

  async getFeatureExposures(params: GetFeatureExposuresParams): Promise<FeatureExposuresResponse> {
    if (this.dryRun) {
      const now = new Date().toISOString();
      return {
        rows: [
          {
            receivedAt: now,
            timestamp: now,
            eventId: 'dry-run-event-1',
            featureName: params.featureName ?? 'dry-run-feature',
            enabled: params.enabled ?? true,
            variant: params.variant ?? 'treatment',
            userId: params.userId ?? 'dry-run-user',
            sessionId: params.sessionId ?? 'dry-run-session',
            environment: params.environment ?? 'development',
            appName: params.appName ?? 'dry-run-app',
            project: params.project ?? 'default',
            payload: {},
            context: {},
          },
        ],
        truncated: false,
      };
    }

    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.featureName) search.set('featureName', params.featureName);
    if (params.variant) search.set('variant', params.variant);
    if (params.enabled !== undefined) search.set('enabled', params.enabled ? 'true' : 'false');
    if (params.userId) search.set('userId', params.userId);
    if (params.sessionId) search.set('sessionId', params.sessionId);
    if (params.environment) search.set('environment', params.environment);
    if (params.appName) search.set('appName', params.appName);
    if (params.project) search.set('project', params.project);
    if (params.limit !== undefined) search.set('limit', params.limit.toString());
    if (params.offset !== undefined) search.set('offset', params.offset.toString());

    const raw = await this.requestJson<{ exposures: FeatureExposureRow[]; truncated?: boolean }>(
      `/api/admin/impression-events/exposures?${search.toString()}`,
      { method: 'GET' },
      {
        errorMessage: 'Failed to fetch feature exposures',
        networkErrorMessage: 'Failed to connect to Unleash API while fetching feature exposures',
      },
    );

    return {
      rows: raw.exposures ?? [],
      truncated: raw.truncated ?? false,
    };
  }

  async getFeatureExposureSummary(
    params: GetFeatureExposureSummaryParams,
  ): Promise<FeatureExposureSummaryResponse> {
    if (this.dryRun) {
      return {
        rows: [
          {
            ...(params.bucket && params.bucket !== 'none'
              ? { bucket: new Date().toISOString() }
              : {}),
            featureName: params.featureName ?? 'dry-run-feature',
            variant: params.variant ?? 'treatment',
            enabled: params.enabled ?? true,
            exposures: 1,
            distinctUsers: 1,
            distinctSessions: 1,
          },
        ],
      };
    }

    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.bucket) search.set('bucket', params.bucket);
    if (params.featureName) search.set('featureName', params.featureName);
    if (params.variant) search.set('variant', params.variant);
    if (params.enabled !== undefined) search.set('enabled', params.enabled ? 'true' : 'false');
    if (params.userId) search.set('userId', params.userId);
    if (params.sessionId) search.set('sessionId', params.sessionId);
    if (params.environment) search.set('environment', params.environment);
    if (params.appName) search.set('appName', params.appName);
    if (params.project) search.set('project', params.project);
    if (params.limit !== undefined) search.set('limit', params.limit.toString());

    const raw = await this.requestJson<{ rows?: FeatureExposureSummaryRow[] }>(
      `/api/admin/impression-events/exposures/summary?${search.toString()}`,
      { method: 'GET' },
      {
        errorMessage: 'Failed to fetch feature exposure summary',
        networkErrorMessage:
          'Failed to connect to Unleash API while fetching feature exposure summary',
      },
    );

    return {
      rows: raw.rows ?? [],
    };
  }

  async getCustomEvents(params: GetCustomEventsParams): Promise<CustomEventsResponse> {
    if (this.dryRun) {
      const now = new Date().toISOString();
      return {
        rows: [
          {
            receivedAt: now,
            timestamp: now,
            eventId: 'dry-run-custom-event-1',
            eventName: params.eventName ?? 'dry-run-event',
            userId: params.userId ?? 'dry-run-user',
            sessionId: params.sessionId ?? 'dry-run-session',
            environment: params.environment ?? 'development',
            appName: params.appName ?? 'dry-run-app',
            project: params.project ?? 'default',
            payload: {},
            context: {},
          },
        ],
        truncated: false,
      };
    }

    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    if (params.eventName) search.set('eventName', params.eventName);
    if (params.userId) search.set('userId', params.userId);
    if (params.sessionId) search.set('sessionId', params.sessionId);
    if (params.environment) search.set('environment', params.environment);
    if (params.appName) search.set('appName', params.appName);
    if (params.project) search.set('project', params.project);
    if (params.limit !== undefined) search.set('limit', params.limit.toString());
    if (params.offset !== undefined) search.set('offset', params.offset.toString());

    const raw = await this.requestJson<{ events: CustomEventRow[]; truncated?: boolean }>(
      `/api/admin/impression-events/custom-events?${search.toString()}`,
      { method: 'GET' },
      {
        errorMessage: 'Failed to fetch custom events',
        networkErrorMessage: 'Failed to connect to Unleash API while fetching custom events',
      },
    );

    return {
      rows: raw.events ?? [],
      truncated: raw.truncated ?? false,
    };
  }

  async getTopImpressionEvents(
    params: GetTopImpressionEventsParams,
  ): Promise<TopImpressionEventsResponse> {
    if (this.dryRun) {
      return {
        groupBy: params.groupBy,
        rows: [
          { key: `dry-run-${params.groupBy}-1`, count: 42 },
          { key: `dry-run-${params.groupBy}-2`, count: 17 },
        ],
      };
    }

    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);
    search.set('groupBy', params.groupBy);
    if (params.featureName) search.set('featureName', params.featureName);
    if (params.eventName) search.set('eventName', params.eventName);
    if (params.variant) search.set('variant', params.variant);
    if (params.enabled !== undefined) search.set('enabled', params.enabled ? 'true' : 'false');
    if (params.userId) search.set('userId', params.userId);
    if (params.sessionId) search.set('sessionId', params.sessionId);
    if (params.environment) search.set('environment', params.environment);
    if (params.appName) search.set('appName', params.appName);
    if (params.project) search.set('project', params.project);
    if (params.limit !== undefined) search.set('limit', params.limit.toString());

    const raw = await this.requestJson<{
      groupBy?: TopImpressionEventsGroupBy;
      rows?: TopImpressionEventsRow[];
    }>(
      `/api/admin/impression-events/top?${search.toString()}`,
      { method: 'GET' },
      {
        errorMessage: 'Failed to fetch top impression events',
        networkErrorMessage:
          'Failed to connect to Unleash API while fetching top impression events',
      },
    );

    return {
      groupBy: raw.groupBy ?? params.groupBy,
      rows: raw.rows ?? [],
    };
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
      `/api/admin/projects/${encodeURIComponent(projectId)}/features`,
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
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.authHeaders,
      'X-Unleash-AppName': 'unleash-mcp',
      'User-Agent': `unleash-mcp/${VERSION} (MCP Server)`,
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
