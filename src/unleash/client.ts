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

export const DEFAULT_FEATURE_FLAG_PAGE_SIZE = 50;
export const MAX_FEATURE_FLAG_PAGE_SIZE = 100;

export function clampFeatureFlagPageSize(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_FEATURE_FLAG_PAGE_SIZE;
  }
  return Math.min(MAX_FEATURE_FLAG_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export interface FeatureFlagPageQuery {
  archived?: boolean;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface FeatureFlagPage {
  flags: FeatureFlagSummary[];
  total: number;
  limit: number;
  offset: number;
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

  async listFeatureFlags(
    projectId: string,
    options: FeatureFlagPageQuery = {},
  ): Promise<FeatureFlagPage> {
    const archived = options.archived === true;
    const limit = clampFeatureFlagPageSize(options.limit);
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const order = options.order ?? 'asc';

    if (this.dryRun) {
      const flags = offset === 0 ? [this.dryRunPlaceholderFlag(projectId, archived)] : [];
      return { flags, total: 1, limit, offset };
    }

    return this.searchFeatureFlags({ projectId, archived, order, limit, offset });
  }

  async findFeatureFlag(
    projectId: string,
    flagName: string,
  ): Promise<FeatureFlagSummary | undefined> {
    if (this.dryRun) {
      return { ...this.dryRunPlaceholderFlag(projectId, false), name: flagName };
    }

    for (const archived of [false, true]) {
      const page = await this.searchFeatureFlags({
        projectId,
        archived,
        order: 'asc',
        limit: MAX_FEATURE_FLAG_PAGE_SIZE,
        offset: 0,
        query: flagName,
      });
      const match = page.flags.find((flag) => flag.name === flagName);
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  private dryRunPlaceholderFlag(projectId: string, archived: boolean): FeatureFlagSummary {
    const name = archived ? 'dry-run-placeholder-archived-flag' : 'dry-run-placeholder-flag';
    const description = archived
      ? 'Dry-run mode placeholder for an archived flag. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real archived flags.'
      : 'Dry-run mode placeholder. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real feature flags.';
    return {
      name,
      description,
      project: projectId,
      type: 'release',
      archived,
      impressionData: false,
      url: `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/features/${name}`,
    };
  }

  private async searchFeatureFlags(search: {
    projectId: string;
    archived: boolean;
    order: 'asc' | 'desc';
    limit: number;
    offset: number;
    query?: string;
  }): Promise<FeatureFlagPage> {
    const { projectId, archived, order, limit, offset, query } = search;
    const params = new URLSearchParams({
      project: `IS:${projectId}`,
      sortBy: 'name',
      sortOrder: order,
      limit: String(limit),
      offset: String(offset),
    });
    if (archived) {
      params.set('archived', 'IS:true');
    }
    if (query) {
      params.set('query', query);
    }

    const filterLabel = archived ? 'archived feature flags' : 'feature flags';
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
      total?: number;
    }>(
      `/api/admin/search/features?${params.toString()}`,
      { method: 'GET' },
      {
        errorMessage: `Failed to list ${filterLabel} for project ${projectId}`,
        networkErrorMessage: `Failed to connect to Unleash API while listing ${filterLabel} for project ${projectId}`,
      },
    );

    const flags = (data.features ?? [])
      .filter((feature): feature is typeof feature & { name: string } => Boolean(feature.name))
      .map((feature) => {
        const project = feature.project ?? projectId;
        return {
          name: feature.name,
          description: feature.description,
          project,
          type: feature.type,
          archived: archived || feature.archived === true,
          impressionData: feature.impressionData,
          createdAt: feature.createdAt,
          url: `${this.baseUrl}/projects/${encodeURIComponent(project)}/features/${encodeURIComponent(feature.name)}`,
        };
      });

    return { flags, total: data.total ?? flags.length, limit, offset };
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
