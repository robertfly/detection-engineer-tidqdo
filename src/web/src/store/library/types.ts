/**
 * @fileoverview Redux store type definitions for detection libraries
 * @version 1.0.0
 * @package @detection-platform/web
 */

// Internal imports
import { 
  Library, 
  CreateLibraryDto, 
  UpdateLibraryDto 
} from '../../types/library';

/**
 * Enum defining all possible library action types
 * Follows Redux best practices for action type naming
 */
export enum LibraryActionTypes {
  FETCH_LIBRARIES = 'library/FETCH_LIBRARIES',
  CREATE_LIBRARY = 'library/CREATE_LIBRARY',
  UPDATE_LIBRARY = 'library/UPDATE_LIBRARY',
  DELETE_LIBRARY = 'library/DELETE_LIBRARY',
  SET_LOADING = 'library/SET_LOADING',
  SET_ERROR = 'library/SET_ERROR'
}

/**
 * Interface defining the shape of library Redux state
 * Includes loading states, error handling, and pagination support
 */
export interface LibraryState {
  /** Array of library objects */
  libraries: Library[];
  /** Loading state indicator */
  loading: boolean;
  /** Error message if operation fails */
  error: string | null;
  /** Total count for pagination */
  totalCount: number;
}

/**
 * Interface for action to fetch libraries with pagination support
 * Payload includes both libraries array and total count
 */
export interface FetchLibrariesAction {
  type: LibraryActionTypes.FETCH_LIBRARIES;
  payload: {
    libraries: Library[];
    totalCount: number;
  };
}

/**
 * Interface for action to create a new library
 * Payload is the created library object returned from API
 */
export interface CreateLibraryAction {
  type: LibraryActionTypes.CREATE_LIBRARY;
  payload: Library;
}

/**
 * Interface for action to update an existing library
 * Payload is the updated library object returned from API
 */
export interface UpdateLibraryAction {
  type: LibraryActionTypes.UPDATE_LIBRARY;
  payload: Library;
}

/**
 * Interface for action to delete a library
 * Payload is the ID of the deleted library
 */
export interface DeleteLibraryAction {
  type: LibraryActionTypes.DELETE_LIBRARY;
  payload: string;
}

/**
 * Interface for action to set loading state
 * Used during async operations
 */
export interface SetLoadingAction {
  type: LibraryActionTypes.SET_LOADING;
  payload: boolean;
}

/**
 * Interface for action to set error state
 * Used when operations fail
 */
export interface SetErrorAction {
  type: LibraryActionTypes.SET_ERROR;
  payload: string | null;
}

/**
 * Union type combining all possible library action types
 * Used for type-safe Redux usage
 */
export type LibraryAction =
  | FetchLibrariesAction
  | CreateLibraryAction
  | UpdateLibraryAction
  | DeleteLibraryAction
  | SetLoadingAction
  | SetErrorAction;

/**
 * Type guard to check if payload is a CreateLibraryDto
 */
export function isCreateLibraryDto(payload: unknown): payload is CreateLibraryDto {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'name' in payload &&
    'description' in payload &&
    'visibility' in payload
  );
}

/**
 * Type guard to check if payload is an UpdateLibraryDto
 */
export function isUpdateLibraryDto(payload: unknown): payload is UpdateLibraryDto {
  return (
    isCreateLibraryDto(payload) &&
    'version' in payload
  );
}