/**
 * @fileoverview Core application constants with type-safe implementations
 * @version 1.0.0
 */

/**
 * Type-safe storage key constants for browser storage management
 */
export const STORAGE_CONSTANTS = {
  LOCAL_STORAGE_KEYS: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    USER_PROFILE: 'user_profile',
    THEME_PREFERENCE: 'theme_preference',
    LANGUAGE_PREFERENCE: 'language_preference'
  },
  SESSION_STORAGE_KEYS: {
    CURRENT_WORKSPACE: 'current_workspace',
    DETECTION_DRAFT: 'detection_draft',
    SEARCH_FILTERS: 'search_filters',
    NAVIGATION_STATE: 'navigation_state'
  }
} as const;

/**
 * API rate limiting configuration constants
 * Time windows are in milliseconds
 */
export const RATE_LIMIT_CONSTANTS = {
  MAX_REQUESTS: 1000,      // Maximum requests per time window
  TIME_WINDOW: 3600000,    // 1 hour in milliseconds
  BURST_LIMIT: 50,         // Maximum burst requests allowed
  COOLDOWN_PERIOD: 300000  // 5 minutes cooldown period
} as const;

/**
 * WebSocket configuration and event management constants
 * Time intervals are in milliseconds
 */
export const WEBSOCKET_CONSTANTS = {
  RECONNECT_ATTEMPTS: 3,    // Maximum reconnection attempts
  RECONNECT_INTERVAL: 5000, // 5 seconds between reconnection attempts
  PING_INTERVAL: 30000,     // 30 seconds ping interval
  EVENTS: {
    DETECTION_CREATED: 'detection.created',
    INTELLIGENCE_PROCESSED: 'intelligence.processed',
    COVERAGE_UPDATED: 'coverage.updated',
    TRANSLATION_COMPLETE: 'translation.complete'
  }
} as const;

/**
 * Application-wide error code mapping following technical specification ranges
 * - Authentication errors: 1000-1999
 * - Detection errors: 2000-2999
 * - API errors: 5000-5999
 * - System errors: 8000-8999
 */
export const ERROR_CODES = {
  AUTH: {
    INVALID_CREDENTIALS: 1001,
    TOKEN_EXPIRED: 1002,
    UNAUTHORIZED: 1003,
    INVALID_MFA: 1004,
    SESSION_EXPIRED: 1005
  },
  API: {
    RATE_LIMIT_EXCEEDED: 5001,
    SERVICE_UNAVAILABLE: 8001,
    INVALID_REQUEST: 5002,
    TIMEOUT: 5003
  },
  DETECTION: {
    INVALID_FORMAT: 2001,
    VALIDATION_FAILED: 2002,
    TRANSLATION_FAILED: 2003,
    COVERAGE_ERROR: 2004
  }
} as const;

// Type definitions for better TypeScript support
type StorageConstantsType = typeof STORAGE_CONSTANTS;
type RateLimitConstantsType = typeof RATE_LIMIT_CONSTANTS;
type WebSocketConstantsType = typeof WEBSOCKET_CONSTANTS;
type ErrorCodesType = typeof ERROR_CODES;

// Ensure immutability at type level
declare const storageConstants: Readonly<StorageConstantsType>;
declare const rateLimitConstants: Readonly<RateLimitConstantsType>;
declare const webSocketConstants: Readonly<WebSocketConstantsType>;
declare const errorCodes: Readonly<ErrorCodesType>;