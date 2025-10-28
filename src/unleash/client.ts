import { CustomError } from '../utils/errors.js';

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.pat,
        },
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

  /**
   * Validate that a project exists (placeholder for future use).
   * Not implemented yet, but reserved for validation logic.
   */
  async validateProject(_projectId: string): Promise<boolean> {
    // TODO: Implement project validation if needed
    // For now, we'll rely on the create endpoint to fail if project doesn't exist
    return true;
  }
}
