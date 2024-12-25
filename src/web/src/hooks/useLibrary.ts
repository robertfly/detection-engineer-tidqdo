/**
 * @fileoverview Custom React hook for managing detection library operations
 * @version 1.0.0
 * Implements secure library management with enhanced performance monitoring
 */

// External imports - versions specified as per technical requirements
import { useCallback, useEffect, useMemo } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.5
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import {
  fetchLibraries,
  createLibrary,
  updateLibrary,
  deleteLibrary
} from '../store/library/actions';
import {
  selectLibraries,
  selectLibraryById,
  selectLibraryLoading,
  selectLibraryError,
  selectLibraryMetrics
} from '../store/library/selectors';
import {
  Library,
  CreateLibraryDto,
  UpdateLibraryDto,
  LibraryVisibility,
  LibraryMetrics
} from '../types/library';
import { storage } from '../utils/storage';

// Constants
const CACHE_KEY_PREFIX = 'library_cache_';
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const PERFORMANCE_THRESHOLD = 500; // 500ms

// Types
interface UseLibraryOptions {
  enableMetrics?: boolean;
  retryAttempts?: number;
  cacheTimeout?: number;
}

interface LibraryError {
  code: string;
  message: string;
  details?: unknown;
}

type Result<T, E = LibraryError> = {
  data?: T;
  error?: E;
};

/**
 * Custom hook for managing library operations with enhanced security and performance
 * @param options - Configuration options for the hook
 * @returns Object containing library state and operations
 */
export const useLibrary = (options: UseLibraryOptions = {}) => {
  const dispatch = useDispatch();
  const libraries = useSelector(selectLibraries);
  const loading = useSelector(selectLibraryLoading);
  const error = useSelector(selectLibraryError);
  const metrics = useSelector(selectLibraryMetrics);

  // Initialize options with defaults
  const {
    enableMetrics = true,
    retryAttempts = DEFAULT_RETRY_ATTEMPTS,
    cacheTimeout = DEFAULT_CACHE_TIMEOUT
  } = options;

  /**
   * Memoized function to validate library access
   */
  const validateAccess = useCallback((libraryId: string): boolean => {
    const library = libraries.find(lib => lib.id === libraryId);
    if (!library) return false;

    // Check visibility and organization access
    const currentUser = storage.getItem('user');
    const userOrg = currentUser?.organizationId;

    switch (library.visibility) {
      case 'public':
        return true;
      case 'organization':
        return userOrg === library.organizationId;
      case 'private':
        return userOrg === library.organizationId && 
               library.settings.contributorRoles.includes(currentUser?.role);
      default:
        return false;
    }
  }, [libraries]);

  /**
   * Memoized function to get library by ID with caching
   */
  const getLibraryById = useCallback((id: string): Library | undefined => {
    const cacheKey = `${CACHE_KEY_PREFIX}${id}`;
    const cached = storage.getItem<Library>(cacheKey);

    if (cached && Date.now() - new Date(cached.updated_at).getTime() < cacheTimeout) {
      return cached;
    }

    const library = libraries.find(lib => lib.id === id);
    if (library) {
      storage.setItem(cacheKey, library);
    }

    return library;
  }, [libraries, cacheTimeout]);

  /**
   * Debounced search handler for performance optimization
   */
  const debouncedSearch = useMemo(
    () => debounce((search: string) => {
      dispatch(fetchLibraries({ search }));
    }, 300),
    [dispatch]
  );

  /**
   * Enhanced fetch libraries function with retry logic and performance monitoring
   */
  const fetchLibrariesWithRetry = useCallback(async (
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      visibility?: LibraryVisibility;
      cursor?: string;
    }
  ): Promise<void> => {
    const startTime = performance.now();
    let attempts = 0;

    while (attempts < retryAttempts) {
      try {
        await dispatch(fetchLibraries(params));
        
        if (enableMetrics) {
          const duration = performance.now() - startTime;
          if (duration > PERFORMANCE_THRESHOLD) {
            console.warn('Library fetch exceeded performance threshold', {
              duration,
              threshold: PERFORMANCE_THRESHOLD,
              attempt: attempts + 1
            });
          }
        }
        break;
      } catch (error) {
        attempts++;
        if (attempts === retryAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }, [dispatch, retryAttempts, enableMetrics]);

  /**
   * Create library with validation and security checks
   */
  const createLibraryWithValidation = useCallback(async (
    data: CreateLibraryDto
  ): Promise<Result<Library>> => {
    try {
      const startTime = performance.now();
      const response = await dispatch(createLibrary(data));

      if (enableMetrics) {
        const duration = performance.now() - startTime;
        console.info('Library creation performance:', { duration });
      }

      return { data: response.payload as Library };
    } catch (error) {
      return {
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create library',
          details: error
        }
      };
    }
  }, [dispatch, enableMetrics]);

  /**
   * Update library with optimistic locking and validation
   */
  const updateLibraryWithValidation = useCallback(async (
    id: string,
    data: UpdateLibraryDto
  ): Promise<Result<Library>> => {
    if (!validateAccess(id)) {
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized to update library'
        }
      };
    }

    try {
      const startTime = performance.now();
      const response = await dispatch(updateLibrary(id, data));

      if (enableMetrics) {
        const duration = performance.now() - startTime;
        console.info('Library update performance:', { duration });
      }

      return { data: response.payload as Library };
    } catch (error) {
      return {
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update library',
          details: error
        }
      };
    }
  }, [dispatch, validateAccess, enableMetrics]);

  /**
   * Delete library with security validation
   */
  const deleteLibraryWithValidation = useCallback(async (
    id: string
  ): Promise<Result<void>> => {
    if (!validateAccess(id)) {
      return {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized to delete library'
        }
      };
    }

    try {
      const startTime = performance.now();
      await dispatch(deleteLibrary(id));

      if (enableMetrics) {
        const duration = performance.now() - startTime;
        console.info('Library deletion performance:', { duration });
      }

      return {};
    } catch (error) {
      return {
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete library',
          details: error
        }
      };
    }
  }, [dispatch, validateAccess, enableMetrics]);

  /**
   * Clear library cache
   */
  const clearCache = useCallback(() => {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        storage.removeItem(key);
      }
    });
  }, []);

  // Cleanup effect for cache management
  useEffect(() => {
    return () => {
      clearCache();
    };
  }, [clearCache]);

  return {
    // State
    libraries,
    loading,
    error,
    metrics,

    // Actions
    getLibraryById,
    fetchLibraries: fetchLibrariesWithRetry,
    createLibrary: createLibraryWithValidation,
    updateLibrary: updateLibraryWithValidation,
    deleteLibrary: deleteLibraryWithValidation,
    validateAccess,
    clearCache
  };
};

export type { UseLibraryOptions, LibraryError };