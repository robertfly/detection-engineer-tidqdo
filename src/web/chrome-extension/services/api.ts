// External imports with versions
import axios, { AxiosInstance, AxiosError } from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import { AES, enc } from 'crypto-js'; // v4.1.1
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { DOMUtils, type PageMetadata, type ContentResult } from '../utils/dom';

// Types and interfaces
interface PendingRequest {
  url: string;
  method: string;
  data: any;
  timestamp: number;
}

interface IntelligenceContent {
  content: string;
  metadata: PageMetadata;
  source: {
    url: string;
    timestamp: string;
    type: string;
  };
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

// Global constants
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000/api/v1';
const API_ENDPOINTS = {
  AUTH: '/auth',
  INTELLIGENCE: '/intelligence',
  DETECTIONS: '/detections',
  REFRESH: '/auth/refresh'
};
const REQUEST_CONFIG = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RATE_LIMIT: 100
};
const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PROFILE: 'user_profile',
  PENDING_REQUESTS: 'pending_requests'
};

/**
 * Enhanced API service class for secure Chrome extension communication
 */
export class IntelligenceAPI {
  private axiosInstance: AxiosInstance;
  private domUtils: DOMUtils;
  private requestQueue: PendingRequest[] = [];
  private encryptionKey: string;

  constructor() {
    // Initialize axios instance with enhanced configuration
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': chrome.runtime.getManifest().version
      }
    });

    // Configure retry mechanism
    axiosRetry(this.axiosInstance, {
      retries: REQUEST_CONFIG.RETRY_ATTEMPTS,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });

    // Initialize DOM utilities
    this.domUtils = new DOMUtils({
      performanceMonitoring: true,
      securityPolicies: {
        sanitizeContent: true,
        validateOutput: true
      }
    });

    // Setup request interceptors
    this.setupInterceptors();

    // Generate encryption key for secure storage
    this.encryptionKey = this.generateEncryptionKey();

    // Initialize offline support
    this.initializeOfflineSupport();
  }

  /**
   * Securely retrieves stored authentication token
   */
  private async getStoredToken(): Promise<string | null> {
    try {
      const { auth_token } = await chrome.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
      if (!auth_token) return null;

      const decrypted = AES.decrypt(auth_token, this.encryptionKey).toString(enc.Utf8);
      return decrypted || null;
    } catch (error) {
      console.error('Error retrieving stored token:', error);
      return null;
    }
  }

  /**
   * Securely stores authentication token
   */
  private async setStoredToken(token: string): Promise<void> {
    try {
      const encrypted = AES.encrypt(token, this.encryptionKey).toString();
      await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: encrypted });
    } catch (error) {
      console.error('Error storing token:', error);
      throw error;
    }
  }

  /**
   * Captures intelligence from current page with enhanced security
   */
  public async captureIntelligence(): Promise<IntelligenceContent> {
    try {
      const startTime = performance.now();

      // Extract content using DOM utilities
      const { content, metadata, metrics } = await this.domUtils.getMainContent({
        includeShadowDOM: true,
        waitForDynamic: true,
        validateOutput: true
      });

      const intelligence: IntelligenceContent = {
        content: content,
        metadata: metadata,
        source: {
          url: window.location.href,
          timestamp: new Date().toISOString(),
          type: this.determineContentType(metadata)
        }
      };

      // Log performance metrics
      const endTime = performance.now();
      this.logPerformanceMetric('intelligence_capture', endTime - startTime);

      return intelligence;
    } catch (error) {
      console.error('Intelligence capture failed:', error);
      throw error;
    }
  }

  /**
   * Submits captured intelligence to backend
   */
  public async submitIntelligence(intelligence: IntelligenceContent): Promise<void> {
    try {
      await this.axiosInstance.post(API_ENDPOINTS.INTELLIGENCE, intelligence);
    } catch (error) {
      // Queue for offline support if network error
      if (axios.isAxiosError(error) && !error.response) {
        await this.queueOfflineRequest(API_ENDPOINTS.INTELLIGENCE, 'POST', intelligence);
      }
      throw error;
    }
  }

  /**
   * Authenticates with the backend service
   */
  public async authenticate(credentials: { email: string; password: string }): Promise<void> {
    try {
      const response = await this.axiosInstance.post<AuthResponse>(
        API_ENDPOINTS.AUTH,
        credentials
      );
      await this.setStoredToken(response.data.token);
      this.setupTokenRefresh(response.data.expiresIn);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Refreshes authentication token
   */
  public async refreshToken(): Promise<void> {
    try {
      const response = await this.axiosInstance.post<AuthResponse>(API_ENDPOINTS.REFRESH);
      await this.setStoredToken(response.data.token);
      this.setupTokenRefresh(response.data.expiresIn);
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  // Private helper methods
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          await this.refreshToken();
          return this.axiosInstance(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  private generateEncryptionKey(): string {
    return chrome.runtime.id + navigator.userAgent;
  }

  private async initializeOfflineSupport(): Promise<void> {
    const { pending_requests } = await chrome.storage.local.get(STORAGE_KEYS.PENDING_REQUESTS);
    this.requestQueue = pending_requests || [];
    
    // Process queued requests when online
    window.addEventListener('online', () => this.processOfflineQueue());
  }

  private async queueOfflineRequest(url: string, method: string, data: any): Promise<void> {
    const request: PendingRequest = {
      url,
      method,
      data,
      timestamp: Date.now()
    };
    this.requestQueue.push(request);
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.PENDING_REQUESTS]: this.requestQueue 
    });
  }

  private async processOfflineQueue(): Promise<void> {
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      try {
        await this.axiosInstance({
          url: request.url,
          method: request.method,
          data: request.data
        });
        this.requestQueue.shift();
        await chrome.storage.local.set({
          [STORAGE_KEYS.PENDING_REQUESTS]: this.requestQueue
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          // Remove failed request if it's a non-recoverable error
          this.requestQueue.shift();
        }
        break;
      }
    }
  }

  private determineContentType(metadata: PageMetadata): string {
    // Implement content type detection logic
    return 'article';
  }

  private setupTokenRefresh(expiresIn: number): void {
    setTimeout(() => {
      this.refreshToken();
    }, (expiresIn - 300) * 1000); // Refresh 5 minutes before expiration
  }

  private logPerformanceMetric(metric: string, value: number): void {
    // Log performance metric to backend
    this.axiosInstance.post('/metrics', {
      metric,
      value,
      timestamp: Date.now()
    }).catch(console.error);
  }
}

// Export types for external use
export type { IntelligenceContent, AuthResponse, PendingRequest };