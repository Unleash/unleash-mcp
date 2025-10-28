import { z } from 'zod';
import type { Logger } from '../utils/logger.js';
import { HttpError } from '../utils/errors.js';

interface ClientOptions {
  baseUrl: string;
  token: string;
  dryRun: boolean;
  logger: Logger;
}

export interface CreateFeatureFlagInput {
  projectId: string;
  name: string;
  type: 'experiment' | 'kill-switch' | 'release' | 'operational' | 'permission';
  description?: string | null;
}

interface CreateFeatureFlagOptions {
  signal?: AbortSignal;
}

const FeatureResponseSchema = z.object({
  name: z.string(),
  project: z.string().optional(),
  type: z.string().optional(),
  description: z.string().nullable().optional()
});

export interface CreateFeatureFlagResult {
  feature: z.infer<typeof FeatureResponseSchema>;
  links: {
    api: string;
    ui: string;
  };
  dryRun: boolean;
}

export class UnleashAdminClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly dryRun: boolean;
  private readonly logger: Logger;

  constructor(options: ClientOptions) {
    this.baseUrl = stripTrailingSlash(options.baseUrl);
    this.token = options.token;
    this.dryRun = options.dryRun;
    this.logger = options.logger;
  }

  async createFeatureFlag(
    input: CreateFeatureFlagInput,
    options: CreateFeatureFlagOptions = {}
  ): Promise<CreateFeatureFlagResult> {
    const apiUrl = this.buildApiUrl(
      `api/admin/projects/${encodeURIComponent(input.projectId)}/features`
    );

    const payload = {
      name: input.name,
      type: input.type,
      description: input.description ?? null
    };

    if (this.dryRun) {
      this.logger.info('Dry-run enabled: skipping Unleash API call', {
        projectId: input.projectId,
        feature: input.name
      });

      return {
        feature: {
          name: input.name,
          project: input.projectId,
          type: input.type,
          description: input.description ?? null
        },
        links: this.buildLinks(input.projectId, input.name),
        dryRun: true
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: this.token
      },
      body: JSON.stringify(payload),
      signal: options.signal
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        // Swallow JSON parsing errors to avoid secondary failures in error handling.
      }

      this.logger.error('Unleash API request failed', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody
      });

      throw new HttpError(
        response.status,
        `Failed to create feature flag "${input.name}" in project "${input.projectId}".`,
        errorBody
      );
    }

    const data = FeatureResponseSchema.parse(await response.json());

    return {
      feature: data,
      links: this.buildLinks(input.projectId, data.name),
      dryRun: false
    };
  }

  getFeatureApiUrl(projectId: string, featureName: string) {
    return this.buildApiUrl(
      `api/admin/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}`
    );
  }

  getFeatureUiUrl(projectId: string, featureName: string) {
    return `${this.baseUrl}/#/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureName)}`;
  }

  private buildApiUrl(path: string) {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private buildLinks(projectId: string, featureName: string) {
    return {
      api: this.getFeatureApiUrl(projectId, featureName),
      ui: this.getFeatureUiUrl(projectId, featureName)
    };
  }
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
