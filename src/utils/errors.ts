import { z } from 'zod';

/**
 * Normalized error structure for consistent error handling across the MCP server.
 * Provides a standard format that LLMs can parse and respond to gracefully.
 */
export interface NormalizedError {
  code: string;
  message: string;
  hint?: string;
}

/**
 * Normalize various error types into a consistent format.
 * Handles Zod validation errors, HTTP errors, and custom errors.
 */
export function normalizeError(error: unknown): NormalizedError {
  // Zod validation errors
  if (error instanceof z.ZodError) {
    const firstError = error.errors[0];
    return {
      code: 'VALIDATION_ERROR',
      message: `Validation failed: ${firstError.message}`,
      hint: `Field: ${firstError.path.join('.')}. Please check your input and try again.`,
    };
  }

  // HTTP/Fetch errors
  if (error instanceof Error && 'status' in error) {
    const httpError = error as Error & { status: number; statusText?: string };
    return {
      code: `HTTP_${httpError.status}`,
      message: httpError.message || httpError.statusText || 'HTTP request failed',
      hint: getHttpErrorHint(httpError.status),
    };
  }

  // Custom errors with code property
  if (error instanceof Error && 'code' in error) {
    return {
      code: (error as Error & { code: string }).code,
      message: error.message,
      hint: 'hint' in error ? (error as Error & { hint?: string }).hint : undefined,
    };
  }

  // Generic Error objects
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      hint: 'An unexpected error occurred. Please check the logs for more details.',
    };
  }

  // Non-Error objects
  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    hint: 'An unexpected error occurred. Please check the logs for more details.',
  };
}

/**
 * Provide helpful hints based on HTTP status codes.
 */
function getHttpErrorHint(status: number): string | undefined {
  switch (status) {
    case 401:
      return 'Check your UNLEASH_PAT (Personal Access Token) in the .env file.';
    case 403:
      return 'Your token may not have permission to perform this action. Check your Unleash user permissions.';
    case 404:
      return 'The requested resource was not found. Verify the project ID and endpoint.';
    case 409:
      return 'A resource with this name already exists. Try a different name or update the existing resource.';
    case 422:
      return 'The request was invalid. Check the request parameters and try again.';
    case 429:
      return 'Rate limit exceeded. Please wait before making more requests.';
    case 500:
    case 502:
    case 503:
      return 'Unleash server error. Please try again later or check the Unleash service status.';
    default:
      return undefined;
  }
}

/**
 * Create a custom error with code and hint properties.
 */
export class CustomError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string
  ) {
    super(message);
    this.name = 'CustomError';
  }
}
