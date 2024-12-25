import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // v6.4.0
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import LibraryList from '../../components/library/LibraryList';
import Button from '../../components/common/Button';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useLibrary } from '../../hooks/useLibrary';
import { LibraryVisibility } from '../../types/library';

// Constants
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Props interface for LibraryList page component
 */
interface LibraryListPageProps {
  className?: string;
  initialFilter?: LibraryFilter;
  onError?: (error: Error) => void;
}

/**
 * Interface for library filtering options
 */
interface LibraryFilter {
  search: string;
  visibility: LibraryVisibility | null;
  sortBy: 'name' | 'updatedAt' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

/**
 * Main page component for displaying library list with enhanced features
 * Implements Material Design 3.0 specifications and accessibility features
 */
const LibraryListPage: React.FC<LibraryListPageProps> = ({
  className,
  initialFilter,
  onError
}) => {
  const navigate = useNavigate();
  
  // Initialize library hook with error handling
  const {
    libraries,
    loading,
    error,
    fetchLibraries,
    clearCache
  } = useLibrary({
    enableMetrics: true,
    retryAttempts: 3
  });

  // State management
  const [filter, setFilter] = useState<LibraryFilter>({
    search: initialFilter?.search || '',
    visibility: initialFilter?.visibility || null,
    sortBy: initialFilter?.sortBy || 'updatedAt',
    sortOrder: initialFilter?.sortOrder || 'desc'
  });

  // Memoized debounced search handler
  const debouncedSearch = useMemo(
    () => debounce((searchTerm: string) => {
      setFilter(prev => ({ ...prev, search: searchTerm }));
    }, SEARCH_DEBOUNCE_MS),
    []
  );

  // Handle library creation
  const handleCreateLibrary = useCallback(() => {
    try {
      navigate('/libraries/create');
    } catch (error) {
      console.error('Navigation error:', error);
      onError?.(error as Error);
    }
  }, [navigate, onError]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilter: Partial<LibraryFilter>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  }, []);

  // Handle visibility filter change
  const handleVisibilityChange = useCallback((visibility: LibraryVisibility | null) => {
    handleFilterChange({ visibility });
  }, [handleFilterChange]);

  // Handle sort change
  const handleSortChange = useCallback((sortBy: LibraryFilter['sortBy']) => {
    handleFilterChange({
      sortBy,
      sortOrder: filter.sortBy === sortBy && filter.sortOrder === 'asc' ? 'desc' : 'asc'
    });
  }, [filter.sortBy, filter.sortOrder, handleFilterChange]);

  // Fetch libraries when filter changes
  useEffect(() => {
    fetchLibraries({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      search: filter.search,
      visibility: filter.visibility,
      sortBy: filter.sortBy,
      sortOrder: filter.sortOrder
    });
  }, [fetchLibraries, filter]);

  // Clear cache on unmount
  useEffect(() => {
    return () => {
      clearCache();
    };
  }, [clearCache]);

  // Error handling
  useEffect(() => {
    if (error) {
      onError?.(new Error(error));
    }
  }, [error, onError]);

  return (
    <ErrorBoundary>
      <div className={`library-list-page ${className || ''}`}>
        {/* Header Section */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Detection Libraries
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage and organize your detection rules
            </p>
          </div>
          
          <Button
            variant="primary"
            onClick={handleCreateLibrary}
            ariaLabel="Create new library"
            className="create-library-button"
          >
            Create Library
          </Button>
        </div>

        {/* Filters Section */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Search Input */}
          <input
            type="search"
            placeholder="Search libraries..."
            className="flex-grow px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:border-gray-700"
            onChange={(e) => debouncedSearch(e.target.value)}
            aria-label="Search libraries"
          />

          {/* Visibility Filter */}
          <select
            value={filter.visibility || ''}
            onChange={(e) => handleVisibilityChange(e.target.value as LibraryVisibility || null)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:border-gray-700"
            aria-label="Filter by visibility"
          >
            <option value="">All Visibilities</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="organization">Organization</option>
          </select>

          {/* Sort Options */}
          <select
            value={filter.sortBy}
            onChange={(e) => handleSortChange(e.target.value as LibraryFilter['sortBy'])}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:border-gray-700"
            aria-label="Sort libraries"
          >
            <option value="updatedAt">Last Updated</option>
            <option value="createdAt">Created Date</option>
            <option value="name">Name</option>
          </select>
        </div>

        {/* Library List */}
        <LibraryList
          initialPage={1}
          pageSize={DEFAULT_PAGE_SIZE}
          filter={{
            search: filter.search,
            visibility: filter.visibility,
            sortBy: filter.sortBy,
            sortOrder: filter.sortOrder
          }}
          enableVirtualization
          className="mt-4"
        />

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center mt-8" role="status">
            <span className="sr-only">Loading libraries...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div 
            className="mt-8 p-4 bg-error-50 text-error-700 rounded-lg"
            role="alert"
          >
            <p className="font-medium">Error loading libraries</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default LibraryListPage;