import { CustomError } from '../utils/errors.js';
import { VERSION } from '../version.js';

/**
 * Feature flag types supported by Unleash.
 * See: https://docs.getunleash.io/reference/feature-toggle-types
 */
export type FeatureFlagType = 'release' | 'experiment' | 'operational' | 'kill-switch' | 'permission';

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
}

export interface FeatureFlagSummary {
  name: string;
  description?: string;
  project: string;
  type?: FeatureFlagType;
  archived?: boolean;
  impressionData?: boolean;
  createdAt?: string;
}

/**
 * Minimal Unleash Admin API client focused on feature flag creation.
 * Uses native fetch (Node 18+) for HTTP requests.
 */
export class UnleashClient {
  private readonly baseUrl: string;
  private readonly pat: string;
  private readonly dryRun: boolean;

  constructor(baseUrl: string, pat: string, dryRun: boolean = false) {
    // Ensure baseUrl doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.pat = pat;
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
    request: CreateFeatureFlagRequest
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

    const url = `${this.baseUrl}/api/admin/projects/${projectId}/features`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildRequestHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Failed to create feature flag: ${response.status} ${response.statusText}`;

        // Try to parse error details from response body
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.details && Array.isArray(errorJson.details)) {
            errorMessage = errorJson.details.map((d: { message: string }) => d.message).join(', ');
          }
        } catch {
          // If parsing fails, use the raw error body if it's short
          if (errorBody.length < 200) {
            errorMessage += `: ${errorBody}`;
          }
        }

        throw new CustomError(`HTTP_${response.status}`, errorMessage);
      }

      const data = await response.json() as CreateFeatureFlagResponse;
      return data;
    } catch (error) {
      // Re-throw CustomError as-is
      if (error instanceof CustomError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new CustomError(
          'NETWORK_ERROR',
          'Failed to connect to Unleash API',
          `Check that UNLEASH_BASE_URL (${this.baseUrl}) is correct and accessible.`
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  async listProjects(): Promise<UnleashProjectSummary[]> {
    if (this.dryRun) {
      return [
        {
          id: 'default',
          name: 'Default (dry run)',
          description:
            'Dry-run mode placeholder. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real projects.',
        },
      ];
    }

    const url = `${this.baseUrl}/api/admin/projects`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildRequestHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Failed to list projects: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          if (errorBody.length < 200) {
            errorMessage += `: ${errorBody}`;
          }
        }

        throw new CustomError(`HTTP_${response.status}`, errorMessage);
      }

      const data = (await response.json()) as {
        projects?: Array<{
          id?: string;
          name?: string;
          description?: string;
          mode?: string;
        }>;
      };

      if (!Array.isArray(data.projects)) {
        return [];
      }

      return data.projects.map((project) => ({
        id: project.id ?? project.name ?? 'unknown-project',
        name: project.name ?? project.id ?? 'Unnamed project',
        description: project.description,
        mode: project.mode,
      }));
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new CustomError(
          'NETWORK_ERROR',
          'Failed to connect to Unleash API while listing projects',
          `Check that UNLEASH_BASE_URL (${this.baseUrl}) is reachable.`
        );
      }

      throw error;
    }
  }

  async listFeatureFlags(projectId?: string): Promise<FeatureFlagSummary[]> {
    if (this.dryRun) {
      return [
        {
          name: 'dry-run-placeholder-flag',
          description:
            'Dry-run mode placeholder. Set UNLEASH_BASE_URL and UNLEASH_PAT to fetch real feature flags.',
          project: projectId ?? 'default',
          type: 'release',
          archived: false,
          impressionData: false,
        },
      ];
    }

    if (projectId) {
      return this.fetchProjectFeatureFlags(projectId);
    }

    const projects = await this.listProjects();

    const featureCollections = await Promise.all(
      projects.map(async (project) => {
        try {
          return await this.fetchProjectFeatureFlags(project.id);
        } catch (error) {
          // Allow other projects to succeed even if one fails.
          if (error instanceof CustomError) {
            throw error;
          }
          throw error;
        }
      })
    );

    return featureCollections.flat();
  }

  private async fetchProjectFeatureFlags(
    projectId: string
  ): Promise<FeatureFlagSummary[]> {
    const url = `${this.baseUrl}/api/admin/projects/${encodeURIComponent(projectId)}/features`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildRequestHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Failed to list feature flags for project ${projectId}: ${response.status} ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          if (errorBody.length < 200) {
            errorMessage += `: ${errorBody}`;
          }
        }

        throw new CustomError(`HTTP_${response.status}`, errorMessage);
      }

      const data = (await response.json()) as {
        features?: Array<{
          name?: string;
          description?: string;
          type?: FeatureFlagType;
          archived?: boolean;
          impressionData?: boolean;
          createdAt?: string;
          project?: string;
        }>;
      };

      return (data.features ?? [])
        .filter((f) => f.name)
        .map((feature) => ({
          name: feature.name!,
          description: feature.description,
          project: feature.project ?? projectId,
          type: feature.type,
          archived: feature.archived,
          impressionData: feature.impressionData,
          createdAt: feature.createdAt,
        }));
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new CustomError(
          'NETWORK_ERROR',
          `Failed to connect to Unleash API while listing flags for project ${projectId}`,
          `Check that UNLEASH_BASE_URL (${this.baseUrl}) is reachable.`
        );
      }

      throw error;
    }
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
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': this.pat.trim(),
      'X-Unleash-AppName': 'unleash-mcp',
      'User-Agent': `unleash-mcp/${VERSION} (MCP Server)`,
    };
  }
}
