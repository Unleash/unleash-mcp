import { HttpClient } from '../http/httpClient.js';

export class FeedbackHttpClient {
  private readonly http: HttpClient;

  /**
   * @param baseUrl Resolved Unleash instance base URL (e.g. `https://host/hosted`)
   *   as returned by `resolveFeedbackBaseUrl`; `/feedback` is appended to it.
   */
  constructor(baseUrl: string) {
    this.http = new HttpClient(baseUrl, {
      networkErrorMessage: 'Failed to connect to the Unleash feedback endpoint',
      networkErrorHint: `Check that UNLEASH_FEEDBACK_URL (${baseUrl}) is reachable.`,
    });
  }

  async send(areasForImprovement: string): Promise<void> {
    await this.http.request(
      '/feedback',
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
