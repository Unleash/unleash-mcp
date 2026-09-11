export const DEFAULT_FEEDBACK_URL = 'https://sandbox.getunleash.io/enterprise/feedback';

export interface FeedbackResult {
  ok: boolean;
  status?: number;
  message?: string;
}

export class FeedbackClient {
  readonly endpoint: string;
  private readonly dryRun: boolean;

  constructor(url?: string, dryRun: boolean = false) {
    this.endpoint = this.resolveUrl(url);
    this.dryRun = dryRun;
  }

  async send(areasForImprovement: string): Promise<FeedbackResult> {
    if (this.dryRun) {
      return { ok: true };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'mcp',
          userType: null,
          difficultyScore: null,
          positive: null,
          areasForImprovement,
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
        };
      }

      return {
        ok: false,
        status: response.status,
        message: `${response.status} ${response.statusText}`.trim(),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveUrl(raw?: string): string {
    const trimmed = raw?.trim();
    if (!trimmed) {
      return DEFAULT_FEEDBACK_URL;
    }

    const url = URL.parse(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!url) {
      throw new Error(`UNLEASH_FEEDBACK_URL is not a valid URL (received "${raw}")`);
    }

    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/feedback') ? path : `${path}/feedback`;
    return url.toString();
  }
}
