/**
 * @fileoverview TypeScript type definitions for detection libraries
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { z } from 'zod'; // v3.22.0+

// Internal imports
import { ApiResponse, PaginatedResponse } from './api';

/**
 * Library visibility levels aligned with data classification requirements
 */
export type LibraryVisibility = 'private' | 'organization' | 'public';

/**
 * Library-specific error codes
 */
export type LibraryError =
  | 'INVALID_NAME'
  | 'INVALID_VISIBILITY'
  | 'INVALID_SETTINGS'
  | 'UNAUTHORIZED_ACCESS';

/**
 * Library validation error structure
 */
export type LibraryValidationError = {
  code: LibraryError;
  message: string;
  field?: string;
};

/**
 * Core interface for library configuration settings
 * Implements role-based access controls and contribution management
 */
export interface LibrarySettings {
  /** Allow community contributions to library */
  allowContributions: boolean;
  /** Require approval for contributions */
  requireApproval: boolean;
  /** Automatically translate new detections */
  autoTranslate: boolean;
  /** Roles allowed to contribute */
  contributorRoles: string[];
  /** Roles allowed to approve changes */
  approverRoles: string[];
}

/**
 * Core interface for detection library data structure
 * Implements comprehensive versioning and metadata support
 */
export interface Library {
  /** Unique identifier */
  id: string;
  /** Library name */
  name: string;
  /** Library description */
  description: string;
  /** Associated organization ID */
  organizationId: string;
  /** Visibility level */
  visibility: LibraryVisibility;
  /** Configuration settings */
  settings: LibrarySettings;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Version number for optimistic locking */
  version: number;
}

/**
 * Interface for library creation payload
 */
export interface CreateLibraryDto {
  name: string;
  description: string;
  visibility: LibraryVisibility;
  settings?: Partial<LibrarySettings>;
}

/**
 * Interface for library update payload
 * Includes version for concurrency control
 */
export interface UpdateLibraryDto {
  name: string;
  description: string;
  visibility: LibraryVisibility;
  settings?: Partial<LibrarySettings>;
  version: number;
}

/**
 * Type definitions for API responses
 */
export type LibraryResponse = ApiResponse<Library>;
export type LibraryListResponse = PaginatedResponse<Library>;

/**
 * Zod schema for library settings validation
 */
const librarySettingsSchema = z.object({
  allowContributions: z.boolean(),
  requireApproval: z.boolean(),
  autoTranslate: z.boolean(),
  contributorRoles: z.array(z.string()),
  approverRoles: z.array(z.string())
});

/**
 * Zod schema for library validation
 * Implements strict validation rules for all library properties
 */
export const librarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(100),
  description: z.string().max(500),
  organizationId: z.string().uuid(),
  visibility: z.enum(['private', 'organization', 'public']),
  settings: librarySettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive()
});

/**
 * Type guard to validate if an unknown object is a Library
 * @param value - Value to check
 * @returns True if value is a valid Library object
 */
export function isLibrary(value: unknown): value is Library {
  try {
    librarySchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates library creation/update payload against schema
 * @param data - Data to validate
 * @param isUpdate - Whether this is an update operation
 * @returns Array of validation errors or empty array if valid
 */
export function validateLibraryDto(
  data: unknown,
  isUpdate: boolean
): LibraryValidationError[] {
  const errors: LibraryValidationError[] = [];

  // Create appropriate schema based on operation
  const validationSchema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(500),
    visibility: z.enum(['private', 'organization', 'public']),
    settings: librarySettingsSchema.partial(),
    ...(isUpdate && { version: z.number().int().positive() })
  });

  try {
    validationSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        errors.push({
          code: 'INVALID_SETTINGS',
          message: err.message,
          field: err.path.join('.')
        });
      });
    }
  }

  // Additional business logic validation
  const dto = data as CreateLibraryDto | UpdateLibraryDto;
  
  if (dto.visibility === 'public' && dto.settings?.requireApproval === false) {
    errors.push({
      code: 'INVALID_SETTINGS',
      message: 'Public libraries must require approval for contributions',
      field: 'settings.requireApproval'
    });
  }

  return errors;
}