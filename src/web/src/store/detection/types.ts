/**
 * @fileoverview TypeScript type definitions for detection Redux store slice
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { PayloadAction } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { 
  Detection, 
  DetectionCreate, 
  DetectionUpdate,
  DetectionStatus,
  DetectionPlatform
} from '../../types/detection';

/**
 * Interface defining the normalized state structure for the detection slice
 * Implements efficient lookup and updates with normalized storage pattern
 */
export interface DetectionState {
  /** Normalized detection storage with ID keys */
  detections: Record<string, Detection>;
  /** Currently selected detection ID */
  selectedId: string | null;
  /** Granular loading states for different operations */
  loading: LoadingState;
  /** Structured error state */
  error: ErrorState;
  /** Active filter criteria */
  filters: DetectionFilters;
  /** Pagination state */
  pagination: PaginationState;
}

/**
 * Interface tracking loading states for different detection operations
 */
export interface LoadingState {
  /** Loading state for fetch operations */
  fetch: boolean;
  /** Loading state for create operations */
  create: boolean;
  /** Loading state for update operations */
  update: boolean;
  /** Loading state for delete operations */
  delete: boolean;
}

/**
 * Interface for structured error state management
 * Aligned with API error response format
 */
export interface ErrorState {
  /** Error code from API response */
  code: string | null;
  /** Human-readable error message */
  message: string | null;
  /** Additional error details */
  details: Record<string, unknown> | null;
}

/**
 * Interface defining comprehensive detection filtering options
 * Supports advanced search and MITRE ATT&CK framework mapping
 */
export interface DetectionFilters {
  /** Filter by detection status */
  status: DetectionStatus[];
  /** Filter by detection platform */
  platform: DetectionPlatform[];
  /** Filter by library ID */
  library_id: string | null;
  /** Text search query */
  search: string;
  /** Filter by MITRE tactics */
  mitreTactics: string[];
  /** Filter by MITRE techniques */
  mitreTechniques: string[];
  /** Filter by detection tags */
  tags: string[];
  /** Filter by detection author */
  author: string | null;
}

/**
 * Interface for managing detection list pagination
 */
export interface PaginationState {
  /** Current page number (1-based) */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of items */
  total: number;
}

/**
 * Initial state for the detection slice
 * Sets default values for all state properties
 */
export const initialState: DetectionState = {
  detections: {},
  selectedId: null,
  loading: {
    fetch: false,
    create: false,
    update: false,
    delete: false
  },
  error: {
    code: null,
    message: null,
    details: null
  },
  filters: {
    status: [],
    platform: [],
    library_id: null,
    search: '',
    mitreTactics: [],
    mitreTechniques: [],
    tags: [],
    author: null
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0
  }
};

/**
 * Type definitions for action payloads to ensure type safety
 */
export type FetchDetectionsPayload = {
  filters?: Partial<DetectionFilters>;
  page?: number;
  limit?: number;
};

export type CreateDetectionPayload = DetectionCreate;

export type UpdateDetectionPayload = {
  id: string;
  updates: DetectionUpdate;
};

export type DeleteDetectionPayload = {
  id: string;
};

export type SetFiltersPayload = Partial<DetectionFilters>;

export type SetPaginationPayload = Partial<PaginationState>;

export type SetSelectedDetectionPayload = string | null;

export type SetErrorPayload = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
} | null;