import { ZodError } from 'zod';

export interface NormalizedError {
  code: string;
  message: string;
  hint?: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof HttpError) {
    const hint = typeof error.body === 'object' && error.body !== null && 'message' in error.body
      ? String((error.body as Record<string, unknown>).message)
      : undefined;

    let code = 'http_error';
    if (error.status === 401) {
      code = 'unauthorized';
    } else if (error.status === 403) {
      code = 'forbidden';
    } else if (error.status === 404) {
      code = 'not_found';
    }

    return {
      code,
      message: error.message,
      hint
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'validation_error',
      message: 'Input validation failed',
      hint: error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')
    };
  }

  if (error instanceof ConfigError) {
    return {
      code: 'config_error',
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: 'unknown_error',
      message: error.message
    };
  }

  return {
    code: 'unknown_error',
    message: 'An unexpected error occurred.'
  };
}
