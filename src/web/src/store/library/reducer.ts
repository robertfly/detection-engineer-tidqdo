/**
 * @fileoverview Redux reducer for detection library state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { produce } from 'immer'; // v10.0.2

// Internal imports
import { 
  LibraryState, 
  LibraryAction, 
  LibraryActionTypes,
  Library,
  LibraryError,
  LibraryVisibility,
  isLibrary
} from './types';

/**
 * Initial state for library reducer
 * Implements secure defaults and type-safe initialization
 */
const initialState: LibraryState = {
  libraries: [],
  loading: false,
  error: null,
  totalCount: 0,
  pagination: {
    page: 1,
    pageSize: 20,
    sort: 'updatedAt',
    order: 'desc'
  },
  filters: {
    visibility: null as LibraryVisibility | null,
    search: '',
    tags: [],
    organizationId: null as string | null
  }
};

/**
 * Redux reducer for library state management
 * Implements immutable state updates using Immer
 * 
 * @param state - Current library state
 * @param action - Dispatched library action
 * @returns Updated library state
 */
const libraryReducer = (
  state: LibraryState = initialState,
  action: LibraryAction
): LibraryState => {
  return produce(state, (draft) => {
    switch (action.type) {
      case LibraryActionTypes.FETCH_LIBRARIES: {
        // Validate incoming library data
        const validLibraries = action.payload.libraries.filter(isLibrary);
        
        draft.libraries = validLibraries;
        draft.totalCount = action.payload.totalCount;
        draft.loading = false;
        draft.error = null;
        break;
      }

      case LibraryActionTypes.CREATE_LIBRARY: {
        // Validate new library before adding to state
        if (isLibrary(action.payload)) {
          draft.libraries.unshift(action.payload);
          draft.totalCount += 1;
          draft.error = null;
        } else {
          draft.error = {
            code: 'INVALID_LIBRARY',
            message: 'Invalid library data received'
          };
        }
        draft.loading = false;
        break;
      }

      case LibraryActionTypes.UPDATE_LIBRARY: {
        const index = draft.libraries.findIndex(lib => lib.id === action.payload.id);
        if (index !== -1 && isLibrary(action.payload)) {
          // Verify version for optimistic locking
          if (action.payload.version > draft.libraries[index].version) {
            draft.libraries[index] = action.payload;
            draft.error = null;
          } else {
            draft.error = {
              code: 'VERSION_CONFLICT',
              message: 'Library has been modified by another user'
            };
          }
        }
        draft.loading = false;
        break;
      }

      case LibraryActionTypes.DELETE_LIBRARY: {
        const index = draft.libraries.findIndex(lib => lib.id === action.payload);
        if (index !== -1) {
          draft.libraries.splice(index, 1);
          draft.totalCount -= 1;
          draft.error = null;
        }
        draft.loading = false;
        break;
      }

      case LibraryActionTypes.SET_LOADING: {
        draft.loading = action.payload;
        break;
      }

      case LibraryActionTypes.SET_ERROR: {
        draft.error = action.payload;
        draft.loading = false;
        break;
      }

      case LibraryActionTypes.SET_PAGINATION: {
        // Validate pagination parameters
        const { page, pageSize, sort, order } = action.payload;
        if (page > 0 && pageSize > 0) {
          draft.pagination = {
            page,
            pageSize,
            sort: sort || draft.pagination.sort,
            order: order || draft.pagination.order
          };
        }
        break;
      }

      case LibraryActionTypes.SET_FILTERS: {
        // Validate visibility filter
        const { visibility, search, tags, organizationId } = action.payload;
        if (!visibility || ['private', 'organization', 'public'].includes(visibility)) {
          draft.filters = {
            visibility,
            search: search || '',
            tags: Array.isArray(tags) ? tags : [],
            organizationId: organizationId || null
          };
        }
        break;
      }

      case LibraryActionTypes.CHANGE_VISIBILITY: {
        const { libraryId, visibility, organizationId } = action.payload;
        const index = draft.libraries.findIndex(lib => lib.id === libraryId);
        
        if (index !== -1) {
          // Verify organization access for visibility change
          if (draft.libraries[index].organizationId === organizationId) {
            draft.libraries[index].visibility = visibility;
            draft.error = null;
          } else {
            draft.error = {
              code: 'UNAUTHORIZED_ACCESS',
              message: 'Unauthorized to change library visibility'
            };
          }
        }
        draft.loading = false;
        break;
      }

      default:
        // Return draft unchanged for unknown actions
        break;
    }
  });
};

export default libraryReducer;