/**
 * @fileoverview API configuration and setup for the AI-Driven Detection Engineering platform
 * @version 1.0.0
 * Implements API architecture, authentication flow, and security protocols as per technical specifications
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import { STORAGE_CONSTANTS } from './constants';

// Global API configuration constants
export const API_VERSION = 'v1';
export const BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const API_TIMEOUT = 30000;
export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000;

/**
 * Type definitions for API endpoints and responses
 */
interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  requiresAuth: boolean;
  rateLimit?: number;
}

interface ApiEndpoints {
  [key: string]: Record<string, ApiEndpoint>;
}

/**
 * Comprehensive API endpoint configurations
 */
export const API_ENDPOINTS: ApiEndpoints = {
  AUTH: {
    LOGIN: { path: '/auth/login', method: 'POST', requiresAuth: false },
    REFRESH: { path: '/auth/refresh', method: 'POST', requiresAuth: false },
    LOGOUT: { path: '/auth/logout', method: 'POST', requiresAuth: true },
    MFA_VERIFY: { path: '/auth/mfa/verify', method: 'POST', requiresAuth: false }
  },
  DETECTIONS: {
    LIST: { path: '/detections', method: 'GET', requiresAuth: true, rateLimit: 1000 },
    CREATE: { path: '/detections', method: 'POST', requiresAuth: true, rateLimit: 100 },
    UPDATE: { path: '/detections/:id', method: 'PUT', requiresAuth: true, rateLimit: 100 },
    DELETE: { path: '/detections/:id', method: 'DELETE', requiresAuth: true }
  },
  INTELLIGENCE: {
    PROCESS: { path: '/intelligence/process', method: 'POST', requiresAuth: true, rateLimit: 50 },
    STATUS: { path: '/intelligence/:id/status', method: 'GET', requiresAuth: true }
  },
  TRANSLATIONS: {
    TRANSLATE: { path: '/translate', method: 'POST', requiresAuth: true, rateLimit: 100 },
    PLATFORMS: { path: '/translate/platforms', method: 'GET', requiresAuth: true }
  },
  COVERAGE: {
    ANALYZE: { path: '/coverage/analyze', method: 'POST', requiresAuth: true },
    REPORT: { path: '/coverage/report', method: 'GET', requiresAuth: true }
  },
  LIBRARIES: {
    LIST: { path: '/libraries', method: 'GET', requiresAuth: true },
    CREATE: { path: '/libraries', method: 'POST', requiresAuth: true }
  },
  VALIDATION: {
    VALIDATE: { path: '/validate', method: 'POST', requiresAuth: true },
    TEST_CASES: { path: '/validate/test-cases', method: 'GET', requiresAuth: true }
  }
};

/**
 * Enhanced axios configuration with security features
 */
export const API_CONFIG = {
  baseURL: `${BASE_URL}/api/${API_VERSION}`,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': process.env.VITE_APP_VERSION || '1.0.0',
    'X-Request-ID': () => crypto.randomUUID()
  },
  withCredentials: true,
  validateStatus: (status: number) => status >= 200 && status < 500
};

/**
 * Constructs full API URL with validation and error handling
 * @param endpoint - API endpoint path
 * @param pathParams - Optional path parameters to interpolate
 * @returns Formatted API URL
 */
export const getApiUrl = (endpoint: string, pathParams?: Record<string, string>): string => {
  try {
    let url = endpoint;
    
    if (pathParams) {
      Object.entries(pathParams).forEach(([key, value]) => {
        url = url.replace(`:${key}`, encodeURIComponent(value));
      });
    }

    // Validate URL format
    const fullUrl = `${API_CONFIG.baseURL}${url}`;
    new URL(fullUrl); // Will throw if invalid
    
    return fullUrl;
  } catch (error) {
    console.error('Invalid API URL construction:', error);
    throw new Error('Failed to construct API URL');
  }
};

/**
 * Creates axios interceptors for request/response handling
 * @param axiosInstance - Axios instance to configure
 */
export const createApiInterceptor = (axiosInstance: AxiosInstance): void => {
  // Request interceptor for authentication
  axiosInstance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem(STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;
      
      // Handle token refresh
      if (error.response?.status === 401 && originalRequest) {
        try {
          const refreshToken = localStorage.getItem(STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
          const response = await axiosInstance.post('/auth/refresh', { refreshToken });
          
          if (response.data.accessToken) {
            localStorage.setItem(STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN, response.data.accessToken);
            return axiosInstance(originalRequest);
          }
        } catch (refreshError) {
          // Handle refresh failure
          localStorage.removeItem(STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN);
          localStorage.removeItem(STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN);
          window.location.href = '/login';
        }
      }
      
      return Promise.reject(error);
    }
  );

  // Configure retry strategy
  axiosRetry(axiosInstance, {
    retries: MAX_RETRIES,
    retryDelay: (retryCount) => retryCount * RETRY_DELAY,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
             error.response?.status === 429; // Rate limit retry
    }
  });

  // Add monitoring and metrics
  axiosInstance.interceptors.response.use(
    (response) => {
      // Record successful request metrics
      const duration = Date.now() - response.config.timestamp;
      // Implementation for metrics collection would go here
      return response;
    },
    (error) => {
      // Record failed request metrics
      const duration = Date.now() - error.config.timestamp;
      // Implementation for error metrics collection would go here
      return Promise.reject(error);
    }
  );
};

// Create and configure default axios instance
const apiInstance = axios.create(API_CONFIG);
createApiInterceptor(apiInstance);

export default apiInstance;