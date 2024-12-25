/**
 * @fileoverview TypeScript type definitions for coverage analysis and MITRE ATT&CK mapping
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { ApiResponse, PaginatedResponse } from './api';

/**
 * Coverage type enumeration for MITRE ATT&CK framework levels
 */
export const enum CoverageType {
  TACTIC = 'TACTIC',
  TECHNIQUE = 'TECHNIQUE',
  SUBTECHNIQUE = 'SUBTECHNIQUE'
}

/**
 * Regular expression for validating MITRE ATT&CK IDs
 * Supports:
 * - Tactics: TAxxxx (e.g., TA0001)
 * - Techniques: Txxxx (e.g., T1234)
 * - Sub-techniques: Txxxx.xxx (e.g., T1234.001)
 */
export const MITRE_ID_REGEX = /^(T|TA)\d{4}(\.?\d{3})?$/i;

/**
 * Type guard function to validate MITRE ATT&CK ID format
 * @param id - String to validate as MITRE ATT&CK ID
 * @returns boolean indicating if the string is a valid MITRE ID
 */
export function isMitreId(id: string): id is string & { readonly brand: unique symbol } {
  return typeof id === 'string' && MITRE_ID_REGEX.test(id);
}

/**
 * Branded type for percentage values to ensure type safety
 */
type Percentage = number & { readonly _brand: 'Percentage' };

/**
 * Core interface for coverage data with enhanced type safety
 */
export interface Coverage {
  /** Unique identifier for the coverage entry */
  readonly id: string;
  
  /** MITRE ATT&CK ID with type branding for validation */
  readonly mitre_id: string & { readonly brand: unique symbol };
  
  /** Name of the tactic, technique, or sub-technique */
  name: string;
  
  /** Coverage type indicating the MITRE ATT&CK level */
  type: CoverageType;
  
  /** Coverage percentage with branded type for validation */
  coverage_percentage: Percentage;
  
  /** Number of detections mapped to this item */
  detection_count: number;
  
  /** Additional metadata with immutable type */
  metadata: Readonly<Record<string, unknown>>;
  
  /** Creation timestamp */
  readonly created_at: string;
  
  /** Last update timestamp */
  readonly updated_at: string;
}

/**
 * Interface for coverage metadata fields
 */
export interface CoverageMetadata {
  /** Description of the coverage item */
  description: string;
  
  /** Applicable platforms */
  platform: string[];
  
  /** Required data sources */
  data_sources: string[];
  
  /** External references and documentation */
  references: string[];
}

/**
 * Interface for coverage creation requests
 */
export interface CoverageCreatePayload {
  /** Organization ID for the coverage entry */
  organization_id: string;
  
  /** MITRE ATT&CK ID */
  mitre_id: string;
  
  /** Name of the coverage item */
  name: string;
  
  /** Coverage type */
  type: CoverageType;
  
  /** Coverage metadata */
  metadata: CoverageMetadata;
}

/**
 * Interface for coverage update requests
 */
export interface CoverageUpdatePayload {
  /** Updated coverage percentage */
  coverage_percentage: number;
  
  /** Updated detection count */
  detection_count: number;
  
  /** Optional metadata updates */
  metadata?: Partial<CoverageMetadata>;
}

/**
 * Type for single coverage API response
 */
export interface CoverageResponse extends ApiResponse<Coverage> {
  data: Coverage;
}

/**
 * Type for paginated coverage list response
 */
export interface CoverageListResponse extends PaginatedResponse<Coverage> {
  items: ReadonlyArray<Coverage>;
  total: number;
}