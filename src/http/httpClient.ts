import { CustomError } from '../utils/errors.js';

/**
 * Per-request error reporting options.
 */
export interface RequestErrorOptions {
  /** Message used when the server responds with a non-2xx status. */
  errorMessage: string;
  /** Message used when the request never reaches the server (DNS, refused, etc.). */
  networkErrorMessage?: string;
}

/**
 * Request init restricted to plain-object headers so they can be merged with
 * the client's default headers. `Headers` instances and tuple arrays are not
 * supported.
 */
export type HttpRequestInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

export interface HttpClientOptions {
  /**
   * Invoked per request to produce headers added to every request, so callers
   * can compute dynamic values (auth, attribution). Per-request `init.headers` win.
   */
  headers?: () => Record<string, string>;
  /** Fallback message for network errors when a request doesn't provide one. */
  networkErrorMessage?: string;
  /** Hint attached to network errors. Defaults to a reachability check of baseUrl. */
  networkErrorHint?: string;
}

/**
 * Generic HTTP client built on native fetch.
 *
 * Handles URL composition, default headers, error-body parsing and network-error
 * normalization into `CustomError`. Contains no knowledge of any specific API, so
 * it can back any API-specific client. Non-2xx bodies shaped like `{ message }`
 * or `{ details: [{ message }] }` are used for the error message when present.
 */
export class HttpClient {
  readonly baseUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly networkErrorMessage: string;
  private readonly networkErrorHint: string;

  constructor(baseUrl: string, options: HttpClientOptions = {}) {
    // Ensure baseUrl doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = options.headers ?? (() => ({}));
    this.networkErrorMessage = options.networkErrorMessage ?? 'Failed to connect to API';
    this.networkErrorHint = options.networkErrorHint ?? `Check that ${this.baseUrl} is reachable.`;
  }

  /**
   * Perform a request and parse the response body as JSON.
   */
  async requestJson<T>(
    path: string,
    init: HttpRequestInit,
    options: RequestErrorOptions,
  ): Promise<T> {
    const response = await this.send(path, init, options);
    return (await response.json()) as T;
  }

  /**
   * Perform a request and return the raw response without consuming its body.
   * Useful when only the status matters or the body is not JSON.
   */
  async request(
    path: string,
    init: HttpRequestInit,
    options: RequestErrorOptions,
  ): Promise<Response> {
    return this.send(path, init, options);
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private buildHeaders(init: HttpRequestInit): Record<string, string> {
    return {
      ...this.headers(),
      ...init.headers,
    };
  }

  private async send(
    path: string,
    init: HttpRequestInit,
    options: RequestErrorOptions,
  ): Promise<Response> {
    try {
      const response = await fetch(this.buildUrl(path), {
        ...init,
        headers: this.buildHeaders(init),
      });

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

  /**
   * Build a CustomError from a non-2xx response, preferring the server-provided
   * `message` / `details[].message` fields when the body is JSON.
   */
  private async toHttpError(response: Response, errorMessage: string): Promise<CustomError> {
    const rawBody = await response.text();
    let message = `${errorMessage}: ${response.status} ${response.statusText}`;

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

    return new CustomError(`HTTP_${response.status}`, message);
  }
}
