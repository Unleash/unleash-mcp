import { HttpClient } from '../http/httpClient.js';

export const DEFAULT_FEEDBACK_BASE_URL = 'https://sandbox.getunleash.io/enterprise';

const FEEDBACK_PATH = '/feedback';

/**
 * Sends user feedback about the MCP server to the Unleash feedback endpoint.
 */
export class FeedbackHttpClient {
  readonly endpoint: string;
  private readonly http: HttpClient;
  private readonly dryRun: boolean;

  /**
   * @param baseUrl Unleash instance base URL (e.g. `https://host/hosted`);
   *   `/feedback` is appended to it. Defaults to the Unleash sandbox.
   */
  constructor(baseUrl?: string, dryRun: boolean = false) {
    const resolved = resolveBaseUrl(baseUrl);
    this.endpoint = `${resolved}${FEEDBACK_PATH}`;
    this.dryRun = dryRun;
    this.http = new HttpClient(resolved, {
      networkErrorMessage: 'Failed to connect to the Unleash feedback endpoint',
      networkErrorHint: `Check that UNLEASH_FEEDBACK_URL (${this.endpoint}) is reachable.`,
    });
  }

  async send(areasForImprovement: string): Promise<void> {
    if (this.dryRun) {
      return;
    }

    await this.http.request(
      FEEDBACK_PATH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'mcp',
          userType: null,
          difficultyScore: null,
          positive: null,
          areasForImprovement,
        }),
      },
      { errorMessage: 'Failed to send feedback' },
    );
  }
}

function resolveBaseUrl(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_FEEDBACK_BASE_URL;
  }

  if (!URL.canParse(trimmed) || !/^https?:$/.test(new URL(trimmed).protocol)) {
    throw new Error(
      `UNLEASH_FEEDBACK_URL must be an absolute http(s) instance base URL such as https://host/hosted (received "${raw}")`,
    );
  }

  return trimmed.replace(/\/+$/, '');
}
