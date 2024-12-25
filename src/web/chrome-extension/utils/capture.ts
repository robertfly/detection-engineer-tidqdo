// External imports with versions
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { DOMUtils, type ContentResult } from '../utils/dom';
import { IntelligenceAPI } from '../services/api';

// Types and interfaces
interface CaptureOptions {
  includeDynamicContent?: boolean;
  maxContentLength?: number;
  securityLevel?: 'strict' | 'moderate' | 'relaxed';
  performanceMonitoring?: boolean;
  retryOnFailure?: boolean;
}

interface CaptureMetadata {
  url: string;
  timestamp: Date;
  captureType: string;
  processingTime: number;
  securityChecks: SecurityCheckResult[];
}

interface SecurityContext {
  level: string;
  validations: string[];
  sanitizationApplied: boolean;
  contentClassification: string;
}

interface SecurityCheckResult {
  check: string;
  passed: boolean;
  details?: string;
}

interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  context?: Record<string, any>;
}

interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  timeout: number;
}

interface CaptureHistory {
  timestamp: Date;
  url: string;
  success: boolean;
  error?: string;
}

// Constants
const MIN_CONTENT_LENGTH = 100;
const MAX_CONTENT_LENGTH = 1000000;
const MAX_RETRY_ATTEMPTS = 3;
const COMPRESSION_THRESHOLD = 500000;
const PERFORMANCE_TIMEOUT = 30000;

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: MAX_RETRY_ATTEMPTS,
  backoffMs: 1000,
  timeout: PERFORMANCE_TIMEOUT
};

/**
 * Enhanced class for secure web page content capture with performance monitoring
 * and robust validation
 */
export class ContentCapture {
  private domUtils: DOMUtils;
  private api: IntelligenceAPI;
  private captureHistory: CaptureHistory[] = [];
  private retryConfig: RetryConfig;

  /**
   * Initializes the content capture instance with enhanced configuration
   */
  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.domUtils = new DOMUtils({
      performanceMonitoring: true,
      securityPolicies: {
        sanitizeContent: true,
        validateOutput: true
      }
    });
    this.api = new IntelligenceAPI();
    this.retryConfig = retryConfig;
  }

  /**
   * Captures content from current tab with progressive loading and performance monitoring
   */
  public async captureCurrentPage(options: CaptureOptions = {}): Promise<CaptureResult> {
    const startTime = performance.now();
    try {
      // Get current tab content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Extract content using DOMUtils
      const { content, metadata, metrics } = await this.domUtils.getMainContent({
        includeShadowDOM: true,
        waitForDynamic: options.includeDynamicContent,
        validateOutput: true,
        timeout: this.retryConfig.timeout
      });

      // Validate and sanitize content
      const validationResult = this.validateCapture({
        content,
        url: tab.url || '',
        timestamp: new Date(),
        metadata: metadata,
        securityContext: {
          level: options.securityLevel || 'strict',
          validations: [],
          sanitizationApplied: true,
          contentClassification: 'article'
        }
      });

      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${validationResult.errors[0]?.message}`);
      }

      // Clean and sanitize content
      const cleanContent = await this.domUtils.cleanupContent({
        content,
        options: {
          preserveFormatting: true,
          handleInternational: true,
          securityLevel: options.securityLevel || 'strict'
        }
      });

      // Prepare capture result
      const endTime = performance.now();
      const captureResult: CaptureResult = {
        content: cleanContent,
        url: tab.url || '',
        timestamp: new Date(),
        metadata: metadata,
        securityContext: {
          level: options.securityLevel || 'strict',
          validations: validationResult.recommendations,
          sanitizationApplied: true,
          contentClassification: 'article'
        }
      };

      // Update capture history
      this.updateCaptureHistory({
        timestamp: new Date(),
        url: tab.url || '',
        success: true
      });

      return captureResult;

    } catch (error) {
      // Handle capture failure
      this.updateCaptureHistory({
        timestamp: new Date(),
        url: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Submits captured content with retry mechanism and validation
   */
  public async submitCapture(captureResult: CaptureResult): Promise<SubmissionResult> {
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < this.retryConfig.maxAttempts) {
      try {
        // Validate before submission
        const validationResult = this.validateCapture(captureResult);
        if (!validationResult.isValid) {
          throw new Error(`Validation failed: ${validationResult.errors[0]?.message}`);
        }

        // Compress content if needed
        const processedContent = captureResult.content.length > COMPRESSION_THRESHOLD
          ? await this.compressContent(captureResult.content)
          : captureResult.content;

        // Submit to API
        await this.api.submitIntelligence({
          content: processedContent,
          metadata: captureResult.metadata,
          source: {
            url: captureResult.url,
            timestamp: captureResult.timestamp.toISOString(),
            type: 'article'
          }
        });

        return {
          success: true,
          id: crypto.randomUUID(),
          message: 'Capture submitted successfully',
          retryCount
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        retryCount++;
        if (retryCount < this.retryConfig.maxAttempts) {
          await new Promise(resolve => 
            setTimeout(resolve, this.retryConfig.backoffMs * retryCount)
          );
        }
      }
    }

    throw lastError || new Error('Submission failed after retries');
  }

  /**
   * Enhanced validation with security checks and content analysis
   */
  private validateCapture(captureResult: CaptureResult): ValidationResult {
    const errors: ValidationError[] = [];
    const recommendations: string[] = [];

    // Content length validation
    if (captureResult.content.length < MIN_CONTENT_LENGTH) {
      errors.push({
        code: 'CONTENT_TOO_SHORT',
        message: 'Content length below minimum requirement',
        severity: 'error'
      });
    }
    if (captureResult.content.length > MAX_CONTENT_LENGTH) {
      errors.push({
        code: 'CONTENT_TOO_LONG',
        message: 'Content length exceeds maximum limit',
        severity: 'error'
      });
    }

    // URL validation
    try {
      new URL(captureResult.url);
    } catch {
      errors.push({
        code: 'INVALID_URL',
        message: 'Invalid URL format',
        severity: 'error'
      });
    }

    // Metadata validation
    if (!captureResult.metadata.title) {
      errors.push({
        code: 'MISSING_TITLE',
        message: 'Content title is required',
        severity: 'warning'
      });
    }

    // Security context validation
    if (!['strict', 'moderate', 'relaxed'].includes(captureResult.securityContext.level)) {
      errors.push({
        code: 'INVALID_SECURITY_LEVEL',
        message: 'Invalid security level specified',
        severity: 'error'
      });
    }

    // Add recommendations
    if (captureResult.metadata.readingTime === 0) {
      recommendations.push('Consider adding estimated reading time');
    }
    if (!captureResult.metadata.description) {
      recommendations.push('Adding content description improves processing accuracy');
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      securityStatus: errors.length === 0 ? 'passed' : 'failed',
      recommendations
    };
  }

  private async compressContent(content: string): Promise<string> {
    // Basic compression implementation
    return content.trim().replace(/\s+/g, ' ');
  }

  private updateCaptureHistory(entry: CaptureHistory): void {
    this.captureHistory.unshift(entry);
    if (this.captureHistory.length > 100) {
      this.captureHistory.pop();
    }
  }
}

// Export types
export type {
  CaptureOptions,
  CaptureResult,
  ValidationResult,
  SubmissionResult,
  SecurityContext,
  CaptureMetadata,
  ValidationError,
  RetryConfig,
  CaptureHistory
};