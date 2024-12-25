/**
 * @fileoverview TypeScript type definitions for security detection rules
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { z } from 'zod'; // v3.22.0+

// Internal imports
import { ApiResponse, PaginatedResponse } from './api';

/**
 * Detection status types representing the lifecycle stages of a detection
 */
export type DetectionStatus = 'draft' | 'active' | 'archived' | 'deprecated';

/**
 * Supported detection platforms/query languages
 */
export type DetectionPlatform = 'sigma' | 'kql' | 'spl' | 'yara' | 'chronicle';

/**
 * Detection severity levels
 */
export type DetectionSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Core detection interface matching backend schema with enhanced validation
 * and versioning support
 */
export interface Detection {
  /** Unique identifier for the detection */
  id: string;
  /** Human-readable name of the detection */
  name: string;
  /** Detailed description of the detection's purpose and behavior */
  description: string;
  /** Additional metadata key-value pairs */
  metadata: Record<string, any>;
  /** Detection logic in platform-specific format */
  logic: Record<string, any>;
  /** MITRE ATT&CK technique mappings */
  mitre_mapping: Record<string, string[]>;
  /** Current lifecycle status */
  status: DetectionStatus;
  /** Target platform/query language */
  platform: DetectionPlatform;
  /** ID of the detection creator */
  creator_id: string;
  /** ID of the library containing this detection */
  library_id: string;
  /** Results from the latest validation run */
  validation_results: Record<string, any>;
  /** Results from test case executions */
  test_results: Record<string, any>;
  /** Performance metrics for the detection */
  performance_metrics: Record<string, number>;
  /** Timestamp of last validation */
  last_validated: string;
  /** Semantic version number */
  version: string;
  /** Array of previous version identifiers */
  previous_versions: string[];
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Interface for creating new detections with required fields
 * and enhanced metadata support
 */
export interface DetectionCreate {
  /** Human-readable name of the detection */
  name: string;
  /** Detailed description of the detection's purpose and behavior */
  description: string;
  /** Additional metadata key-value pairs */
  metadata: Record<string, any>;
  /** Detection logic in platform-specific format */
  logic: Record<string, any>;
  /** MITRE ATT&CK technique mappings */
  mitre_mapping: Record<string, string[]>;
  /** Target platform/query language */
  platform: DetectionPlatform;
  /** ID of the library to add the detection to */
  library_id: string;
  /** Array of categorization tags */
  tags: string[];
  /** Detection severity level */
  severity: DetectionSeverity;
}

/**
 * Interface for updating existing detections with
 * partial field updates supported
 */
export interface DetectionUpdate {
  /** Updated name of the detection */
  name: string;
  /** Updated description of the detection */
  description: string;
  /** Updated or additional metadata */
  metadata: Record<string, any>;
  /** Modified detection logic */
  logic: Record<string, any>;
  /** Updated MITRE ATT&CK mappings */
  mitre_mapping: Record<string, string[]>;
  /** New lifecycle status */
  status: DetectionStatus;
  /** Updated categorization tags */
  tags: string[];
  /** Updated severity level */
  severity: DetectionSeverity;
}

/**
 * Zod schema for validating MITRE ATT&CK technique IDs
 */
export const mitreIdSchema = z.string().regex(/^T[0-9]{4}(\.[0-9]{3})?$/);

/**
 * Zod schema for validating detection metadata
 */
export const detectionMetadataSchema = z.record(z.unknown());

/**
 * Type for single detection API responses
 */
export type DetectionResponse = ApiResponse<Detection>;

/**
 * Type for paginated detection list responses
 */
export type DetectionListResponse = PaginatedResponse<Detection>;