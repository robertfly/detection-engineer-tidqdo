// External imports with versions
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { ContentCapture } from './utils/capture';
import { DOMUtils } from './utils/dom';
import { IntelligenceAPI } from './services/api';

// Constants
const CAPTURE_INTERVAL = 5000;
const MAX_RETRIES = 3;
const DEBOUNCE_DELAY = 1000;
const PERFORMANCE_THRESHOLD = 2000;
const ERROR_REPORTING_ENDPOINT = 'https://api.detection-platform.com/v1/errors';

// Types
interface ChromeMessage {
  type: string;
  action: string;
  payload: any;
  securityContext: SecurityContext;
}

interface CaptureState {
  isActive: boolean;
  lastCapture: Date;
  retryCount: number;
  performance: PerformanceMetrics;
}

interface SecurityContext {
  isSecure: boolean;
  encryptionKey: string;
  permissions: string[];
}

interface PerformanceMetrics {
  captureTime: number;
  memoryUsage: number;
  successRate: number;
}

/**
 * ContentScriptManager class handles content monitoring, intelligence capture,
 * and communication with the background script with enhanced security and performance monitoring
 */
class ContentScriptManager {
  private contentCapture: ContentCapture;
  private domUtils: DOMUtils;
  private api: IntelligenceAPI;
  private observer: MutationObserver;
  private isCapturing: boolean;
  private securityContext: SecurityContext;
  private metrics: PerformanceMetrics;
  private captureTimeout: NodeJS.Timeout | null;
  private performanceObserver: PerformanceObserver;

  constructor() {
    this.contentCapture = new ContentCapture({
      maxAttempts: MAX_RETRIES,
      backoffMs: DEBOUNCE_DELAY,
      timeout: PERFORMANCE_THRESHOLD
    });

    this.domUtils = new DOMUtils({
      performanceMonitoring: true,
      securityPolicies: {
        sanitizeContent: true,
        validateOutput: true
      }
    });

    this.api = new IntelligenceAPI();
    this.isCapturing = false;
    this.captureTimeout = null;
    this.metrics = {
      captureTime: 0,
      memoryUsage: 0,
      successRate: 100
    };

    // Initialize security context
    this.securityContext = {
      isSecure: window.isSecureContext,
      encryptionKey: crypto.randomUUID(),
      permissions: []
    };

    // Initialize mutation observer
    this.observer = new MutationObserver(this.handleDOMMutations.bind(this));

    // Initialize performance observer
    this.performanceObserver = new PerformanceObserver(this.handlePerformanceEntry.bind(this));
  }

  /**
   * Initializes the content script with security checks and performance monitoring
   */
  public async initialize(): Promise<void> {
    try {
      // Validate secure context
      if (!this.validateSecureContext()) {
        throw new Error('Insecure context detected');
      }

      // Set up message listeners
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

      // Initialize DOM observer
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });

      // Initialize performance monitoring
      this.performanceObserver.observe({ 
        entryTypes: ['measure', 'resource'] 
      });

      // Start content monitoring
      await this.startCapture();

      console.log('Content script initialized successfully');
    } catch (error) {
      await this.handleError(error, 'initialization');
    }
  }

  /**
   * Starts the content capture process with performance monitoring
   */
  private async startCapture(): Promise<void> {
    if (this.isCapturing) return;

    try {
      this.isCapturing = true;
      const startTime = performance.now();

      // Capture content periodically
      const captureContent = async () => {
        try {
          const captureResult = await this.contentCapture.captureCurrentPage({
            includeDynamicContent: true,
            securityLevel: 'strict',
            performanceMonitoring: true
          });

          // Submit captured content
          await this.api.submitIntelligence({
            content: captureResult.content,
            metadata: captureResult.metadata,
            source: {
              url: window.location.href,
              timestamp: new Date().toISOString(),
              type: 'article'
            }
          });

          // Update metrics
          this.metrics.captureTime = performance.now() - startTime;
          this.metrics.successRate = 100;

        } catch (error) {
          await this.handleError(error, 'content-capture');
        }

        // Schedule next capture
        this.captureTimeout = setTimeout(captureContent, CAPTURE_INTERVAL);
      };

      await captureContent();

    } catch (error) {
      await this.handleError(error, 'capture-start');
      this.isCapturing = false;
    }
  }

  /**
   * Handles messages from the background script
   */
  private handleMessage(
    message: ChromeMessage,
    sender: Runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    try {
      switch (message.action) {
        case 'START_CAPTURE':
          this.startCapture()
            .then(() => sendResponse({ success: true }))
            .catch(error => this.handleError(error, 'message-handler'));
          break;

        case 'STOP_CAPTURE':
          if (this.captureTimeout) {
            clearTimeout(this.captureTimeout);
            this.isCapturing = false;
          }
          sendResponse({ success: true });
          break;

        case 'GET_METRICS':
          sendResponse({ metrics: this.metrics });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      this.handleError(error, 'message-handler')
        .then(() => sendResponse({ error: 'Message handling failed' }));
    }

    return true; // Keep message channel open for async response
  }

  /**
   * Handles DOM mutations with performance monitoring
   */
  private handleDOMMutations(mutations: MutationRecord[]): void {
    const significantChanges = mutations.some(mutation => 
      mutation.type === 'childList' && mutation.addedNodes.length > 0
    );

    if (significantChanges && this.isCapturing) {
      this.debounce(() => this.startCapture(), DEBOUNCE_DELAY);
    }
  }

  /**
   * Handles performance entries for monitoring
   */
  private handlePerformanceEntry(entries: PerformanceObserverEntryList): void {
    entries.getEntries().forEach(entry => {
      if (entry.entryType === 'measure' && entry.name.startsWith('capture')) {
        this.metrics.captureTime = entry.duration;
      }
    });

    // Monitor memory usage if available
    if (performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize;
    }
  }

  /**
   * Enhanced error handling with reporting
   */
  private async handleError(error: Error, context: string): Promise<void> {
    console.error(`Error in ${context}:`, error);

    // Update metrics
    this.metrics.successRate = Math.max(0, this.metrics.successRate - 10);

    // Report error to backend
    try {
      await fetch(ERROR_REPORTING_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context,
          error: error.message,
          stack: error.stack,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          metrics: this.metrics
        })
      });
    } catch (reportError) {
      console.error('Error reporting failed:', reportError);
    }
  }

  /**
   * Validates secure context for content script
   */
  private validateSecureContext(): boolean {
    return window.isSecureContext && 
           window.location.protocol === 'https:' &&
           this.securityContext.isSecure;
  }

  /**
   * Implements debounce functionality for performance optimization
   */
  private debounce(func: Function, delay: number): void {
    if (this.captureTimeout) {
      clearTimeout(this.captureTimeout);
    }
    this.captureTimeout = setTimeout(() => func(), delay);
  }
}

// Initialize content script
const contentScriptManager = new ContentScriptManager();
contentScriptManager.initialize().catch(error => {
  console.error('Content script initialization failed:', error);
});

// Export for external use
export { contentScriptManager };