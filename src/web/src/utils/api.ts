/**
 * @fileoverview Core API utility module providing configured Axios instance and helper functions
 * @version 1.0.0
 * Implements API architecture, authentication flow, and security protocols
 */

// External imports - versions specified as per technical requirements
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import CryptoJS from 'crypto-js'; // v4.2.0

// Internal imports
import { API_CONFIG } from '../config/api';
import { ApiResponse, ApiError, isApiErrorResponse } from '../types/api';
import { storage } from './storage';
import { ERROR_CODES, RATE_LIMIT_CONSTANTS } from '../config/constants';

// Types
interface RateLimitState {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Signs API requests with HMAC for enhanced security
 * @param config - Axios request configuration
 * @returns Signed request configuration
 */
const signRequest = (config: AxiosRequestConfig): AxiosRequestConfig => {
  const timestamp = Date.now().toString();
  const method = config.method?.toUpperCase() || 'GET';
  const path = config.url || '';
  const body = config.data ? JSON.stringify(config.data) : '';

  // Create signature payload
  const payload = `${method}${path}${body}${timestamp}`;
  const signature = CryptoJS.HmacSHA256(
    payload,
    process.env.VITE_API_SECRET_KEY || ''
  ).toString();

  // Add signature headers
  config.headers = {
    ...config.headers,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };

  return config;
};

/**
 * Handles API errors with standardized error codes and retry logic
 * @param error - Axios error object
 * @returns Rejected promise with standardized error
 */
const handleApiError = async (error: AxiosError): Promise<never> => {
  let apiError: ApiError = {
    code: ERROR_CODES.API.SERVICE_UNAVAILABLE.toString(),
    title: 'Service Error',
    detail: 'An unexpected error occurred',
  };

  if (error.response) {
    const { status, data } = error.response;

    // Map HTTP status codes to internal error codes
    switch (status) {
      case 401:
        apiError = {
          code: ERROR_CODES.AUTH.UNAUTHORIZED.toString(),
          title: 'Unauthorized',
          detail: 'Authentication required',
        };
        break;
      case 429:
        apiError = {
          code: ERROR_CODES.API.RATE_LIMIT_EXCEEDED.toString(),
          title: 'Rate Limit Exceeded',
          detail: 'Too many requests',
        };
        break;
      default:
        if (isApiErrorResponse(data)) {
          apiError = data.errors[0];
        }
    }

    // Track error in monitoring system
    console.error('API Error:', {
      status,
      code: apiError.code,
      url: error.config?.url,
      method: error.config?.method,
    });
  }

  return Promise.reject(apiError);
};

/**
 * Creates and configures an Axios instance with interceptors and security features
 * @returns Configured Axios instance
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create(API_CONFIG);

  // Request interceptor for authentication and signing
  client.interceptors.request.use(
    async (config) => {
      const token = await storage.getItem<string>('access_token', true);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add CSRF token for non-GET requests
      if (config.method !== 'get') {
        const csrfToken = document.querySelector<HTMLMetaElement>(
          'meta[name="csrf-token"]'
        )?.content;
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }
      }

      return signRequest(config);
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    handleApiError
  );

  // Configure retry strategy
  axiosRetry(client, {
    retries: API_CONFIG.retryConfig.retries,
    retryDelay: (retryCount) => {
      return retryCount * API_CONFIG.retryConfig.retryDelay;
    },
    retryCondition: (error) => {
      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 429
      );
    },
  });

  // Add performance monitoring
  client.interceptors.request.use((config) => {
    config.metadata = { startTime: Date.now() };
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      const duration = Date.now() - (response.config.metadata?.startTime || 0);
      // Record successful request metrics
      console.debug('API Request Success:', {
        url: response.config.url,
        method: response.config.method,
        duration,
      });
      return response;
    },
    (error) => {
      if (error.config?.metadata?.startTime) {
        const duration = Date.now() - error.config.metadata.startTime;
        // Record failed request metrics
        console.error('API Request Failed:', {
          url: error.config.url,
          method: error.config.method,
          duration,
          error: error.message,
        });
      }
      return Promise.reject(error);
    }
  );

  return client;
};

// Create singleton API client instance
export const apiClient = createApiClient();

// Rate limiting state
let rateLimitState: RateLimitState = {
  limit: RATE_LIMIT_CONSTANTS.MAX_REQUESTS,
  remaining: RATE_LIMIT_CONSTANTS.MAX_REQUESTS,
  reset: Date.now() + RATE_LIMIT_CONSTANTS.TIME_WINDOW,
};

/**
 * Helper function for making typed GET requests
 * @param url - API endpoint URL
 * @param config - Additional Axios config
 * @returns Promise with typed response
 */
export const get = <T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return apiClient.get(url, config).then((response) => response.data);
};

/**
 * Helper function for making typed POST requests
 * @param url - API endpoint URL
 * @param data - Request payload
 * @param config - Additional Axios config
 * @returns Promise with typed response
 */
export const post = <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return apiClient.post(url, data, config).then((response) => response.data);
};

/**
 * Helper function for making typed PUT requests
 * @param url - API endpoint URL
 * @param data - Request payload
 * @param config - Additional Axios config
 * @returns Promise with typed response
 */
export const put = <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return apiClient.put(url, data, config).then((response) => response.data);
};

/**
 * Helper function for making typed DELETE requests
 * @param url - API endpoint URL
 * @param config - Additional Axios config
 * @returns Promise with typed response
 */
export const del = <T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return apiClient.delete(url, config).then((response) => response.data);
};

export type { ApiResponse, ApiError };