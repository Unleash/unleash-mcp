import { HttpClient } from '../http/httpClient.js';

export const DEFAULT_FEEDBACK_URL = 'https://sandbox.getunleash.io/enterprise/feedback';

const FEEDBACK_PATH = '/feedback';

/**
 * Sends user feedback about the MCP server to the Unleash feedback endpoint.
 *
 * Like `UnleashClient`, transport failures are thrown as `CustomError`
 * (`HTTP_<status>` or `NETWORK_ERROR`). Deciding whether a failed report may
 * break the caller is left to the caller.
 */
export class FeedbackHttpClient {
  readonly endpoint: string;
  private readonly http: HttpClient;
  private readonly dryRun: boolean;

  constructor(url?: string, dryRun: boolean = false) {
    const baseUrl = resolveBaseUrl(url);
    this.endpoint = `${baseUrl}${FEEDBACK_PATH}`;
    this.dryRun = dryRun;
    this.http = new HttpClient(baseUrl, {
      headers: () => ({ 'Content-Type': 'application/json' }),
      networkErrorMessage: 'Failed to connect to the Unleash feedback endpoint',
      networkErrorHint: `Check that UNLEASH_FEEDBACK_URL (${this.endpoint}) is reachable.`,
    });
  }

  /**
   * Post a feedback report.
   * @throws CustomError if the request fails
   */
  async send(areasForImprovement: string): Promise<void> {
    if (this.dryRun) {
      return;
    }

    await this.http.request(
      FEEDBACK_PATH,
      {
        method: 'POST',
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

/**
 * Resolve the configured feedback URL into a base URL that `/feedback` is
 * appended to. Accepts an instance base URL (`https://host/hosted`), a full
 * endpoint (`https://host/hosted/feedback`), or a bare host without a scheme.
 */
function resolveBaseUrl(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_FEEDBACK_URL.slice(0, -FEEDBACK_PATH.length);
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`UNLEASH_FEEDBACK_URL is not a valid URL (received "${raw}")`);
  }

  const path = url.pathname.replace(/\/+$/, '');
  const basePath = path.endsWith(FEEDBACK_PATH) ? path.slice(0, -FEEDBACK_PATH.length) : path;
  return `${url.origin}${basePath}`;
}
