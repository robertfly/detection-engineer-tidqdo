/**
 * @fileoverview TypeScript type definitions for detection translations
 * @version 1.0.0
 * @package @detection-platform/web
 */

// Internal imports
import { Detection } from './detection';

/**
 * Supported translation platforms
 */
export enum TranslationPlatform {
  SIGMA = 'SIGMA',
  KQL = 'KQL',
  SPL = 'SPL',
  YARA_L = 'YARA_L'
}

/**
 * Translation processing status
 */
export enum TranslationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}

/**
 * Interface for translation metadata including version and performance metrics
 */
export interface TranslationMetadata {
  /** Semantic version of the translation */
  version: string;
  /** Translation accuracy score (0-100) */
  accuracy_score: number;
  /** Performance metrics for translation execution */
  performance_metrics: Record<string, number>;
  /** Results of validation test cases */
  validation_results: Record<string, boolean>;
}

/**
 * Comprehensive interface for translation objects
 */
export interface Translation {
  /** Unique identifier for the translation */
  id: string;
  /** Reference to source detection */
  detection_id: string;
  /** Target platform for translation */
  platform: TranslationPlatform;
  /** Current translation status */
  status: TranslationStatus;
  /** Translated detection logic */
  translated_logic: string;
  /** Translation metadata and metrics */
  metadata: TranslationMetadata;
  /** Error message if translation failed */
  error_message: string | null;
  /** Detailed error information */
  error_details: Record<string, unknown> | null;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Interface for translation creation requests
 */
export interface TranslationRequest {
  /** ID of detection to translate */
  detection_id: string;
  /** Target platform for translation */
  platform: TranslationPlatform;
  /** Platform-specific translation options */
  options: Record<string, unknown>;
}

/**
 * Interface for single translation API responses
 */
export interface TranslationResponse {
  /** Translation object */
  translation: Translation;
}

/**
 * Interface for paginated translation list responses
 */
export interface TranslationListResponse {
  /** Array of translations */
  translations: Translation[];
  /** Total number of translations */
  total: number;
  /** Current page number */
  page: number;
  /** Items per page */
  page_size: number;
  /** Indicates if more pages exist */
  has_more: boolean;
}