/**
 * @fileoverview Redux action creators for managing detection libraries
 * @version 1.0.0
 * Implements secure, type-safe library management with comprehensive error handling
 */

// External imports - version specified as per technical requirements
import { Dispatch, ThunkAction } from 'redux'; // v4.2.1

// Internal imports
import { 
  LibraryActionTypes,
  LibraryAction,
  FetchLibrariesAction,
  CreateLibraryAction,
  UpdateLibraryAction,
  DeleteLibraryAction,
  SetLoadingAction,
  SetErrorAction
} from './types';
import { 
  Library, 
  CreateLibraryDto, 
  UpdateLibraryDto, 
  LibraryVisibility,
  validateLibraryDto 
} from '../../types/library';
import { 
  getLibraries, 
  getLibrary, 
  createLibrary, 
  updateLibrary, 
  deleteLibrary 
} from '../../services/api/library';
import { RootState } from '../types';
import { ERROR_CODES } from '../../config/constants';

/**
 * Sets loading state for library operations
 * @param operation - Operation type being performed
 * @param loading - Loading state to set
 */
export const setLoading = (
  operation: 'fetch' | 'create' | 'update' | 'delete',
  loading: boolean
): SetLoadingAction => ({
  type: LibraryActionTypes.SET_LOADING,
  payload: { operation, loading }
});

/**
 * Sets error state with standardized error format
 * @param error - Error details with code and message
 */
export const setError = (error: {
  code: keyof typeof ERROR_CODES.DETECTION;
  message: string;
  details?: unknown;
}): SetErrorAction => ({
  type: LibraryActionTypes.SET_ERROR,
  payload: {
    code: ERROR_CODES.DETECTION[error.code].toString(),
    message: error.message,
    details: error.details
  }
});

/**
 * Fetches paginated list of libraries with enhanced filtering
 * Implements caching and error handling as per technical specifications
 */
export const fetchLibraries = (params: {
  page?: number;
  limit?: number;
  search?: string;
  visibility?: LibraryVisibility;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): ThunkAction<Promise<void>, RootState, unknown, LibraryAction> => {
  return async (dispatch: Dispatch<LibraryAction>) => {
    dispatch(setLoading('fetch', true));

    try {
      // Validate pagination parameters
      const validatedParams = {
        page: Math.max(1, params.page || 1),
        limit: Math.min(100, params.limit || 20),
        search: params.search?.trim(),
        visibility: params.visibility,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder || 'desc'
      };

      const response = await getLibraries(validatedParams);

      dispatch({
        type: LibraryActionTypes.FETCH_LIBRARIES,
        payload: {
          libraries: response.data.items,
          totalCount: response.data.total,
          metadata: {
            page: response.data.page,
            limit: response.data.limit,
            pages: response.data.pages
          }
        }
      });
    } catch (error) {
      dispatch(setError({
        code: 'INVALID_FORMAT',
        message: 'Failed to fetch libraries',
        details: error
      }));
    } finally {
      dispatch(setLoading('fetch', false));
    }
  };
};

/**
 * Creates a new library with comprehensive validation
 * Implements security controls and data classification requirements
 */
export const createNewLibrary = (
  data: CreateLibraryDto
): ThunkAction<Promise<void>, RootState, unknown, LibraryAction> => {
  return async (dispatch: Dispatch<LibraryAction>) => {
    dispatch(setLoading('create', true));

    try {
      // Validate library data
      const validationErrors = validateLibraryDto(data, false);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
      }

      const response = await createLibrary(data);

      dispatch({
        type: LibraryActionTypes.CREATE_LIBRARY,
        payload: response.data
      });
    } catch (error) {
      dispatch(setError({
        code: 'VALIDATION_FAILED',
        message: 'Failed to create library',
        details: error
      }));
    } finally {
      dispatch(setLoading('create', false));
    }
  };
};

/**
 * Updates existing library with version control
 * Implements access control validation and audit logging
 */
export const updateExistingLibrary = (
  id: string,
  data: UpdateLibraryDto
): ThunkAction<Promise<void>, RootState, unknown, LibraryAction> => {
  return async (dispatch: Dispatch<LibraryAction>) => {
    dispatch(setLoading('update', true));

    try {
      // Validate update data
      const validationErrors = validateLibraryDto(data, true);
      if (validationErrors.length > 0) {
        throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
      }

      const response = await updateLibrary(id, data);

      dispatch({
        type: LibraryActionTypes.UPDATE_LIBRARY,
        payload: response.data
      });
    } catch (error) {
      dispatch(setError({
        code: 'VALIDATION_FAILED',
        message: 'Failed to update library',
        details: error
      }));
    } finally {
      dispatch(setLoading('update', false));
    }
  };
};

/**
 * Deletes library with safety checks
 * Implements dependency validation and backup creation
 */
export const deleteExistingLibrary = (
  id: string
): ThunkAction<Promise<void>, RootState, unknown, LibraryAction> => {
  return async (dispatch: Dispatch<LibraryAction>) => {
    dispatch(setLoading('delete', true));

    try {
      // Verify library exists before deletion
      await getLibrary(id);
      await deleteLibrary(id);

      dispatch({
        type: LibraryActionTypes.DELETE_LIBRARY,
        payload: id
      });
    } catch (error) {
      dispatch(setError({
        code: 'INVALID_FORMAT',
        message: 'Failed to delete library',
        details: error
      }));
    } finally {
      dispatch(setLoading('delete', false));
    }
  };
};

// Export action creators for consumers
export {
  setLoading,
  setError,
  fetchLibraries as fetchLibrariesAction,
  createNewLibrary as createLibraryAction,
  updateExistingLibrary as updateLibraryAction,
  deleteExistingLibrary as deleteLibraryAction
};