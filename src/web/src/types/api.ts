/**
 * @fileoverview Core TypeScript type definitions for API interactions
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { z } from 'zod'; // v3.22.0+

/**
 * Supported HTTP methods for API requests
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * API response status types
 */
export type ApiStatus = 'success' | 'error';

/**
 * Sort order for paginated requests
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Generic interface for API responses
 * @template T - Type of the response data
 */
export interface ApiResponse<T = unknown> {
  /** Response status indicator */
  status: ApiStatus;
  /** Response payload */
  data: T;
  /** Response metadata */
  meta: {
    /** API version */
    version: string;
    /** Response timestamp */
    timestamp: string;
    /** Request ID for tracing */
    requestId?: string;
  };
  /** Array of error objects if status is 'error' */
  errors?: ApiError[];
}

/**
 * Interface for API error objects
 * Supports error codes in ranges:
 * - 1000-1999: Authentication
 * - 2000-2999: Detection Processing
 * - 3000-3999: Intelligence Processing
 * - 4000-4999: Translation
 * - 5000-5999: Integration
 * - 6000-6999: Validation
 * - 7000-7999: Community
 * - 8000-8999: System
 */
export interface ApiError {
  /** Error code in the range 1000-8999 */
  code: string;
  /** Human-readable error title */
  title: string;
  /** Detailed error description */
  detail: string;
}

/**
 * Interface for pagination request parameters
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page: number;
  /** Items per page */
  limit: number;
  /** Field to sort by */
  sort?: string;
  /** Sort direction */
  order?: SortOrder;
}

/**
 * Generic interface for paginated API responses
 * @template T - Type of items in the response
 */
export interface PaginatedResponse<T = unknown> {
  /** Array of items for current page */
  items: T[];
  /** Total number of items across all pages */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of pages */
  pages: number;
}

/**
 * Interface for API request configuration
 */
export interface ApiRequestConfig {
  /** HTTP method */
  method: HttpMethod;
  /** Request URL */
  url: string;
  /** Request payload */
  data?: unknown;
  /** URL query parameters */
  params?: Record<string, unknown>;
  /** Request headers */
  headers?: Record<string, string>;
}

/**
 * Interface for API error responses
 */
export interface ApiErrorResponse {
  /** Error status indicator */
  status: 'error';
  /** Array of error objects */
  errors: ApiError[];
  /** Error timestamp */
  timestamp: string;
}

/**
 * Zod schema for validating API errors
 */
export const apiErrorSchema = z.object({
  code: z.string().regex(/^[1-8][0-9]{3}$/),
  title: z.string().min(1),
  detail: z.string().min(1),
});

/**
 * Zod schema for validating API response metadata
 */
export const apiMetaSchema = z.object({
  version: z.string(),
  timestamp: z.string().datetime(),
  requestId: z.string().optional(),
});

/**
 * Zod schema for validating pagination parameters
 */
export const paginationParamsSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

/**
 * Type guard to check if a response is an error response
 */
export function isApiErrorResponse(response: unknown): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    response.status === 'error' &&
    'errors' in response &&
    Array.isArray((response as ApiErrorResponse).errors)
  );
}

/**
 * Type guard to check if a response is paginated
 */
export function isPaginatedResponse<T>(response: unknown): response is PaginatedResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'items' in response &&
    'total' in response &&
    'page' in response &&
    'limit' in response &&
    'pages' in response
  );
}