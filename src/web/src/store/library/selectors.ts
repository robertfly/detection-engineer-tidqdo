/**
 * @fileoverview Redux selectors for accessing and deriving library state
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+
import createCachedSelector from 're-reselect'; // v4.0.0+

// Internal imports
import { RootState } from '../rootReducer';
import { LibraryState } from './types';
import { Library, LibraryVisibility } from '../../types/library';

/**
 * Base selector to get the library slice from root state
 * Provides type-safe access to library state
 */
export const selectLibraryState = (state: RootState): LibraryState => state.library;

/**
 * Memoized selector for all libraries
 * Provides cached access to the libraries array
 */
export const selectAllLibraries = createSelector(
  selectLibraryState,
  (state: LibraryState): Library[] => state.libraries
);

/**
 * Memoized selector for loading state
 * Used to track async operations
 */
export const selectLibraryLoading = createSelector(
  selectLibraryState,
  (state: LibraryState): boolean => state.loading
);

/**
 * Memoized selector for error state
 * Provides access to error messages and codes
 */
export const selectLibraryError = createSelector(
  selectLibraryState,
  (state: LibraryState): string | null => state.error
);

/**
 * Memoized selector for total library count
 * Used for pagination calculations
 */
export const selectTotalLibraries = createSelector(
  selectLibraryState,
  (state: LibraryState): number => state.totalCount
);

/**
 * Parameterized selector for finding library by ID
 * Uses re-reselect for enhanced memoization with parameters
 */
export const selectLibraryById = createCachedSelector(
  selectAllLibraries,
  (_: RootState, libraryId: string) => libraryId,
  (libraries: Library[], libraryId: string): Library | undefined => 
    libraries.find(library => library.id === libraryId)
)((_: RootState, libraryId: string) => libraryId);

/**
 * Memoized selector for libraries filtered by visibility
 * Implements security controls based on visibility settings
 */
export const selectLibrariesByVisibility = createSelector(
  selectAllLibraries,
  (_: RootState, visibility: LibraryVisibility) => visibility,
  (libraries: Library[], visibility: LibraryVisibility): Library[] =>
    libraries.filter(library => library.visibility === visibility)
);

/**
 * Memoized selector for community-shared libraries
 * Returns libraries with public visibility and community features
 */
export const selectCommunityLibraries = createSelector(
  selectAllLibraries,
  (libraries: Library[]): Library[] =>
    libraries.filter(
      library => 
        library.visibility === 'public' && 
        library.settings.allowContributions
    )
);

/**
 * Memoized selector for organization libraries
 * Filters libraries by organization access
 */
export const selectOrganizationLibraries = createSelector(
  selectAllLibraries,
  (_: RootState, organizationId: string) => organizationId,
  (libraries: Library[], organizationId: string): Library[] =>
    libraries.filter(
      library => 
        library.organizationId === organizationId &&
        (library.visibility === 'organization' || library.visibility === 'public')
    )
);

/**
 * Memoized selector for libraries with active contributions
 * Returns libraries accepting community contributions
 */
export const selectContributableLibraries = createSelector(
  selectAllLibraries,
  (libraries: Library[]): Library[] =>
    libraries.filter(library => 
      library.settings.allowContributions && 
      (library.visibility === 'public' || library.visibility === 'organization')
    )
);

/**
 * Memoized selector for pagination state
 * Used for managing paginated library lists
 */
export const selectLibraryPagination = createSelector(
  selectLibraryState,
  (state: LibraryState) => ({
    page: state.pagination.page,
    pageSize: state.pagination.pageSize,
    total: state.totalCount,
    hasMore: state.totalCount > state.pagination.page * state.pagination.pageSize
  })
);

/**
 * Memoized selector for current filter settings
 * Provides access to active library filters
 */
export const selectLibraryFilters = createSelector(
  selectLibraryState,
  (state: LibraryState) => state.filters
);

/**
 * Memoized selector for filtered and paginated libraries
 * Combines filters, pagination, and security controls
 */
export const selectFilteredLibraries = createSelector(
  selectAllLibraries,
  selectLibraryFilters,
  (libraries: Library[], filters): Library[] => {
    return libraries.filter(library => {
      // Apply visibility filter
      if (filters.visibility && library.visibility !== filters.visibility) {
        return false;
      }

      // Apply organization filter
      if (filters.organizationId && library.organizationId !== filters.organizationId) {
        return false;
      }

      // Apply search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          library.name.toLowerCase().includes(searchLower) ||
          library.description.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Apply tag filters
      if (filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag => 
          library.metadata?.tags?.includes(tag)
        );
        if (!hasAllTags) return false;
      }

      return true;
    });
  }
);

/**
 * Performance-optimized selector for library statistics
 * Provides metrics about library usage and contributions
 */
export const selectLibraryStats = createSelector(
  selectAllLibraries,
  (libraries: Library[]) => ({
    total: libraries.length,
    public: libraries.filter(lib => lib.visibility === 'public').length,
    organization: libraries.filter(lib => lib.visibility === 'organization').length,
    private: libraries.filter(lib => lib.visibility === 'private').length,
    contributable: libraries.filter(lib => lib.settings.allowContributions).length
  })
);