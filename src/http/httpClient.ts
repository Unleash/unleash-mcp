import { CustomError } from '../utils/errors.js';

export interface RequestErrorOptions {
  errorMessage: string;
  networkErrorMessage?: string;
}

interface ErrorResponseBody {
  message?: string;
  details?: Array<{ message?: string }>;
}

export interface HttpClientOptions {
  networkErrorMessage?: string;
  networkErrorHint?: string;
  fetch?: typeof fetch;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly networkErrorMessage: string;
  private readonly networkErrorHint: string;
  private readonly fetch: typeof fetch;

  constructor(baseUrl: string, options: HttpClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = options.fetch ?? fetch;
    this.networkErrorMessage = options.networkErrorMessage ?? 'Failed to connect to API';
    this.networkErrorHint = options.networkErrorHint ?? `Check that ${this.baseUrl} is reachable.`;
  }

  async requestJson<T>(path: string, init: RequestInit, options: RequestErrorOptions): Promise<T> {
    const response = await this.request(path, init, options);
    return (await response.json()) as T;
  }

  async request(path: string, init: RequestInit, options: RequestErrorOptions): Promise<Response> {
    try {
      const response = await this.fetch(this.buildUrl(path), init);

      if (!response.ok) {
        throw await this.toHttpError(response, options.errorMessage);
      }

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new CustomError(
          'NETWORK_ERROR',
          options.networkErrorMessage ?? this.networkErrorMessage,
          this.networkErrorHint,
        );
      }

      throw error;
    }
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async toHttpError(response: Response, errorMessage: string): Promise<CustomError> {
    const rawBody = await response.text();
    let message = `${errorMessage}: ${response.status} ${response.statusText}`;

    try {
      const parsed = JSON.parse(rawBody) as ErrorResponseBody;

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

    return new CustomError(`HTTP_${response.status}`, message);
  }
}
