/**
 * @fileoverview TypeScript type definitions for intelligence data structures and operations
 * @version 1.0.0
 * @package @detection-platform/web
 */

// Internal imports
import { ApiResponse, PaginatedResponse } from './api';

/**
 * Supported intelligence source types for processing
 * @see Technical Specification 8.1.2 Intelligence Processing Capabilities
 */
export type IntelligenceSourceType = 'pdf' | 'url' | 'image' | 'text' | 'structured_data';

/**
 * Processing status for intelligence items
 * Tracks the lifecycle of intelligence processing from ingestion to completion
 */
export type IntelligenceStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'validation_error';

/**
 * Flexible schema for metadata and processing results
 * Supports arbitrary key-value pairs for extensibility
 */
export type MetadataSchema = {
  [key: string]: string | number | boolean | null;
};

/**
 * Main intelligence interface representing processed threat intelligence
 * Includes comprehensive validation and processing metrics
 */
export interface Intelligence {
  /** Unique identifier for the intelligence item */
  id: string;
  
  /** Human-readable name for the intelligence */
  name: string;
  
  /** Detailed description of the intelligence content */
  description: string;
  
  /** Type of intelligence source being processed */
  source_type: IntelligenceSourceType;
  
  /** URL of the intelligence source if applicable */
  source_url: string | null;
  
  /** Raw content of the intelligence source */
  source_content: string | null;
  
  /** Additional metadata for the intelligence item */
  metadata: MetadataSchema;
  
  /** Current processing status */
  status: IntelligenceStatus;
  
  /** Results from intelligence processing */
  processing_results: MetadataSchema | null;
  
  /** Processing accuracy metric (0-100) */
  processing_accuracy: number | null;
  
  /** Creation timestamp in ISO format */
  created_at: string;
  
  /** Last update timestamp in ISO format */
  updated_at: string;
  
  /** Array of validation error messages if any */
  validation_errors: string[] | null;
}

/**
 * Interface for creating new intelligence items
 * Requires essential fields while maintaining strict validation
 */
export interface IntelligenceCreate {
  /** Human-readable name for the intelligence */
  name: string;
  
  /** Detailed description of the intelligence content */
  description: string;
  
  /** Type of intelligence source being processed */
  source_type: IntelligenceSourceType;
  
  /** URL of the intelligence source if applicable */
  source_url: string | null;
  
  /** Raw content of the intelligence source */
  source_content: string | null;
  
  /** Additional metadata for the intelligence item */
  metadata: MetadataSchema;
}

/**
 * Interface for updating existing intelligence items
 * Limits updatable fields to maintain data integrity
 */
export interface IntelligenceUpdate {
  /** Updated name for the intelligence */
  name: string;
  
  /** Updated description of the intelligence content */
  description: string;
  
  /** Updated metadata for the intelligence item */
  metadata: MetadataSchema;
}

/**
 * Type-safe API response for single intelligence item
 * Extends generic ApiResponse with Intelligence type
 */
export interface IntelligenceResponse extends ApiResponse<Intelligence> {
  data: Intelligence;
}

/**
 * Type-safe API response for paginated intelligence list
 * Extends PaginatedResponse with Intelligence type
 */
export interface IntelligenceListResponse extends PaginatedResponse<Intelligence> {
  items: Intelligence[];
  total: number;
}