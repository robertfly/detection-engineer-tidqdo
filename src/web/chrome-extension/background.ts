// External imports with versions
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { IntelligenceAPI } from './services/api';
import { StorageService, STORAGE_KEYS } from './services/storage';

// Global constants
const ALARM_NAMES = {
  SYNC_INTELLIGENCE: 'sync_intelligence',
  CLEANUP_CACHE: 'cleanup_cache',
  PERFORMANCE_MONITOR: 'performance_monitor'
} as const;

const SYNC_INTERVAL = 300000; // 5 minutes
const CLEANUP_INTERVAL = 86400000; // 24 hours
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BACKOFF_FACTOR: 1.5,
  INITIAL_DELAY: 1000
};

/**
 * Performance monitoring interface
 */
interface PerformanceMetrics {
  captureTime: number;
  processingTime: number;
  syncTime: number;
  errorCount: number;
  lastSync: number;
}

/**
 * Message validation interface
 */
interface MessageValidator {
  validateSource: (sender: Runtime.MessageSender) => boolean;
  validateMessage: (message: any) => boolean;
  validatePermissions: (sender: Runtime.MessageSender) => Promise<boolean>;
}

/**
 * Enhanced background service class for managing extension operations
 */
class BackgroundService {
  private api: IntelligenceAPI;
  private storage: StorageService;
  private performanceMetrics: PerformanceMetrics;
  private messageValidator: MessageValidator;

  constructor() {
    this.api = new IntelligenceAPI();
    this.storage = new StorageService();
    this.performanceMetrics = this.initializeMetrics();
    this.messageValidator = this.initializeValidator();

    this.setupMessageListeners();
    this.setupAlarmListeners();
    this.initializeAlarms();
  }

  /**
   * Sets up secure message listeners with validation and error handling
   */
  private setupMessageListeners(): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('Message handling error:', error);
          sendResponse({ error: error.message });
        });
      return true; // Keep channel open for async response
    });
  }

  /**
   * Handles incoming messages with security validation and performance monitoring
   */
  private async handleMessage(
    message: any,
    sender: Runtime.MessageSender
  ): Promise<any> {
    const startTime = performance.now();

    try {
      // Validate message source and content
      if (!this.messageValidator.validateSource(sender)) {
        throw new Error('Invalid message source');
      }

      if (!this.messageValidator.validateMessage(message)) {
        throw new Error('Invalid message format');
      }

      // Check permissions
      const hasPermission = await this.messageValidator.validatePermissions(sender);
      if (!hasPermission) {
        throw new Error('Insufficient permissions');
      }

      // Process message based on type
      switch (message.type) {
        case 'CAPTURE_INTELLIGENCE':
          return await this.handleCapture(message.data);
        case 'SYNC_REQUEST':
          return await this.syncIntelligence();
        case 'GET_METRICS':
          return this.performanceMetrics;
        default:
          throw new Error('Unknown message type');
      }
    } catch (error) {
      this.performanceMetrics.errorCount++;
      throw error;
    } finally {
      this.updateMetrics('processingTime', performance.now() - startTime);
    }
  }

  /**
   * Handles intelligence capture with offline support and retry mechanism
   */
  private async handleCapture(data: any): Promise<void> {
    const startTime = performance.now();

    try {
      // Attempt to capture and submit intelligence
      const intelligence = await this.api.captureIntelligence();
      await this.api.submitIntelligence(intelligence);

      // Cache successful capture
      await this.storage.cacheIntelligence({
        id: crypto.randomUUID(),
        data: intelligence,
        source: data.source
      });
    } catch (error) {
      // Handle offline scenario
      if (!navigator.onLine) {
        await this.storage.cacheIntelligence({
          id: crypto.randomUUID(),
          data: data,
          source: 'offline_capture'
        });
      } else {
        throw error;
      }
    } finally {
      this.updateMetrics('captureTime', performance.now() - startTime);
    }
  }

  /**
   * Syncs cached intelligence with retry mechanism and batch processing
   */
  private async syncIntelligence(): Promise<void> {
    const startTime = performance.now();

    try {
      const cached = await this.storage.get(STORAGE_KEYS.CACHED_INTELLIGENCE);
      if (!cached || cached.length === 0) return;

      // Process in batches
      const batchSize = 5;
      for (let i = 0; i < cached.length; i += batchSize) {
        const batch = cached.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async item => {
            try {
              await this.api.submitIntelligence(item.data);
              // Remove successfully synced items
              const remaining = (await this.storage.get(STORAGE_KEYS.CACHED_INTELLIGENCE))
                ?.filter(cached => cached.id !== item.id);
              await this.storage.set(STORAGE_KEYS.CACHED_INTELLIGENCE, remaining || []);
            } catch (error) {
              console.error('Sync error for item:', item.id, error);
            }
          })
        );
      }

      await this.storage.set(STORAGE_KEYS.LAST_SYNC, Date.now());
    } finally {
      this.updateMetrics('syncTime', performance.now() - startTime);
    }
  }

  /**
   * Sets up alarm listeners for periodic tasks
   */
  private setupAlarmListeners(): void {
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      switch (alarm.name) {
        case ALARM_NAMES.SYNC_INTELLIGENCE:
          await this.syncIntelligence();
          break;
        case ALARM_NAMES.CLEANUP_CACHE:
          await this.cleanupCache();
          break;
        case ALARM_NAMES.PERFORMANCE_MONITOR:
          await this.monitorPerformance();
          break;
      }
    });
  }

  /**
   * Initializes periodic alarms for background tasks
   */
  private initializeAlarms(): void {
    chrome.alarms.create(ALARM_NAMES.SYNC_INTELLIGENCE, {
      periodInMinutes: SYNC_INTERVAL / 60000
    });

    chrome.alarms.create(ALARM_NAMES.CLEANUP_CACHE, {
      periodInMinutes: CLEANUP_INTERVAL / 60000
    });

    chrome.alarms.create(ALARM_NAMES.PERFORMANCE_MONITOR, {
      periodInMinutes: 15
    });
  }

  /**
   * Initializes performance metrics tracking
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      captureTime: 0,
      processingTime: 0,
      syncTime: 0,
      errorCount: 0,
      lastSync: 0
    };
  }

  /**
   * Initializes message validator with security checks
   */
  private initializeValidator(): MessageValidator {
    return {
      validateSource: (sender: Runtime.MessageSender): boolean => {
        return sender.id === chrome.runtime.id;
      },
      validateMessage: (message: any): boolean => {
        return message && typeof message.type === 'string';
      },
      validatePermissions: async (sender: Runtime.MessageSender): Promise<boolean> => {
        const profile = await this.storage.get(STORAGE_KEYS.USER_PROFILE);
        return !!profile;
      }
    };
  }

  /**
   * Updates performance metrics
   */
  private updateMetrics(metric: keyof PerformanceMetrics, value: number): void {
    this.performanceMetrics[metric] = value;
  }

  /**
   * Cleans up expired cache entries
   */
  private async cleanupCache(): Promise<void> {
    const cached = await this.storage.get(STORAGE_KEYS.CACHED_INTELLIGENCE);
    if (!cached) return;

    const now = Date.now();
    const valid = cached.filter(item => now - item.timestamp < 86400000);
    await this.storage.set(STORAGE_KEYS.CACHED_INTELLIGENCE, valid);
  }

  /**
   * Monitors and reports performance metrics
   */
  private async monitorPerformance(): Promise<void> {
    // Report metrics to backend if needed
    if (this.performanceMetrics.errorCount > 0) {
      console.warn('Performance issues detected:', this.performanceMetrics);
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Export for external use
export { backgroundService };