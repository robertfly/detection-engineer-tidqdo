import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0
import { useNavigate } from 'react-router-dom'; // v6.4.0
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import LibraryCard from './LibraryCard';
import Loading from '../common/Loading';
import ErrorBoundary from '../common/ErrorBoundary';
import { useLibrary } from '../../hooks/useLibrary';
import { Library, LibraryVisibility } from '../../types/library';

// Props interface
interface LibraryListProps {
  /** Additional CSS classes */
  className?: string;
  /** Initial page number */
  initialPage?: number;
  /** Items per page */
  pageSize?: number;
  /** Enable virtualization for large lists */
  enableVirtualization?: boolean;
  /** Number of retry attempts for failed operations */
  retryAttempts?: number;
  /** Loading strategy type */
  loadingStrategy?: 'progressive' | 'skeleton' | 'spinner';
  /** Filter configuration */
  filter?: {
    search?: string;
    visibility?: LibraryVisibility;
    tags?: string[];
  };
}

/**
 * LibraryList component - Renders a high-performance, accessible grid of library cards
 * with comprehensive error handling and loading states.
 */
const LibraryList: React.FC<LibraryListProps> = React.memo(({
  className,
  initialPage = 1,
  pageSize = 20,
  enableVirtualization = true,
  retryAttempts = 3,
  loadingStrategy = 'progressive',
  filter
}) => {
  // Hooks
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    libraries,
    loading,
    error,
    fetchLibraries,
    validateAccess
  } = useLibrary({ retryAttempts });

  // Virtual list configuration
  const rowVirtualizer = useVirtualizer({
    count: libraries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 200, // Estimated card height
    overscan: 5
  });

  // Debounced search handler
  const debouncedSearch = useMemo(
    () => debounce((search: string) => {
      fetchLibraries({ 
        page: initialPage, 
        limit: pageSize,
        search,
        visibility: filter?.visibility
      });
    }, 300),
    [fetchLibraries, initialPage, pageSize, filter?.visibility]
  );

  // Initial data fetch
  useEffect(() => {
    fetchLibraries({
      page: initialPage,
      limit: pageSize,
      ...filter
    });
  }, [fetchLibraries, initialPage, pageSize, filter]);

  // Handle library selection
  const handleLibraryClick = useCallback((library: Library) => {
    if (validateAccess(library.id)) {
      navigate(`/libraries/${library.id}`);
    }
  }, [navigate, validateAccess]);

  // Handle retry on error
  const handleRetry = useCallback(() => {
    fetchLibraries({
      page: initialPage,
      limit: pageSize,
      ...filter
    });
  }, [fetchLibraries, initialPage, pageSize, filter]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loading && containerRef.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            fetchLibraries({
              page: Math.ceil(libraries.length / pageSize) + 1,
              limit: pageSize,
              ...filter
            });
          }
        },
        { threshold: 0.5 }
      );

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [loading, libraries.length, pageSize, fetchLibraries, filter]);

  // Render loading state
  if (loading && libraries.length === 0) {
    switch (loadingStrategy) {
      case 'skeleton':
        return (
          <div className={styles.container}>
            {Array.from({ length: pageSize }).map((_, index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        );
      case 'spinner':
        return <Loading center variant="spinner" />;
      default:
        return <Loading center variant="pulse" />;
    }
  }

  // Render error state
  if (error && libraries.length === 0) {
    return (
      <div className={styles.error} role="alert">
        <h3>Error loading libraries</h3>
        <p>{error}</p>
        <button 
          onClick={handleRetry}
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div 
        ref={containerRef}
        className={`${styles.container} ${className || ''}`}
        role="grid"
        aria-busy={loading}
        aria-label="Library grid"
      >
        <div
          className={styles.grid}
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: 'relative'
          }}
        >
          {enableVirtualization
            ? rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const library = libraries[virtualRow.index];
                return (
                  <div
                    key={library.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <LibraryCard
                      library={library}
                      onClick={handleLibraryClick}
                      className={styles.card}
                    />
                  </div>
                );
              })
            : libraries.map((library) => (
                <LibraryCard
                  key={library.id}
                  library={library}
                  onClick={handleLibraryClick}
                  className={styles.card}
                />
              ))}
        </div>

        {loading && libraries.length > 0 && (
          <div className={styles.loading}>
            <Loading variant="spinner" size="small" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

// Component display name for debugging
LibraryList.displayName = 'LibraryList';

// Styles
const styles = {
  container: [
    'flex flex-col gap-6',
    'w-full',
    'relative',
    'min-h-[200px]'
  ].join(' '),
  grid: [
    'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    'gap-4',
    'auto-rows-max',
    'touch-pan-y'
  ].join(' '),
  card: [
    'h-full',
    'transition-transform duration-200',
    'hover:translate-y-[-2px]'
  ].join(' '),
  error: [
    'flex flex-col items-center justify-center',
    'p-4 rounded-lg',
    'bg-error-50 text-error-900'
  ].join(' '),
  loading: [
    'absolute inset-0',
    'bg-white/80 dark:bg-gray-900/80',
    'backdrop-blur-sm',
    'transition-opacity'
  ].join(' '),
  skeleton: [
    'animate-pulse',
    'bg-gray-200 dark:bg-gray-700',
    'rounded-lg',
    'h-[200px]'
  ].join(' ')
};

export default LibraryList;