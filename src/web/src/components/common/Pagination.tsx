// Pagination.tsx
// Version: 1.0.0
// A comprehensive pagination component implementing Material Design 3.0 specifications
// with enhanced accessibility features and mobile responsiveness.

import React, { memo, useMemo, useCallback, useRef, useEffect } from 'react';
import classnames from 'classnames'; // v2.3+
import { Button } from './Button';

// Constants for pagination configuration
const PAGE_SIZES = [10, 25, 50, 100] as const;
const MAX_VISIBLE_PAGES = 5;
const DEBOUNCE_DELAY = 150;
const MIN_TOUCH_TARGET = 44;

// Default internationalization text
const defaultI18n = {
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageSize: 'Items per page',
  currentPage: 'Current page',
  totalPages: 'of',
  loading: 'Loading pagination...',
  jumpTo: 'Jump to page',
} as const;

// Props interface with comprehensive type definitions
export interface PaginationProps {
  /** Total number of items */
  totalItems: number;
  /** Number of items per page */
  itemsPerPage: number;
  /** Current active page (1-based) */
  currentPage: number;
  /** Optional CSS class name */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show page size selector */
  showPageSize?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Accessible label */
  ariaLabel?: string;
  /** RTL support */
  rtl?: boolean;
  /** Internationalization */
  i18n?: Partial<typeof defaultI18n>;
  /** Test ID for testing */
  testId?: string;
  /** Page change callback */
  onPageChange: (page: number) => void;
  /** Page size change callback */
  onPageSizeChange?: (pageSize: number) => void;
}

/**
 * Enhanced pagination component with accessibility and performance optimizations
 */
const Pagination: React.FC<PaginationProps> = memo(({
  totalItems,
  itemsPerPage,
  currentPage,
  className,
  disabled = false,
  showPageSize = false,
  isLoading = false,
  ariaLabel = 'Pagination navigation',
  rtl = false,
  i18n = {},
  testId = 'pagination',
  onPageChange,
  onPageSizeChange,
}) => {
  // Merge i18n with defaults
  const labels = { ...defaultI18n, ...i18n };
  
  // Refs for debouncing and focus management
  const timeoutRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total pages with memoization
  const totalPages = useMemo(() => 
    Math.max(1, Math.ceil(totalItems / itemsPerPage)),
    [totalItems, itemsPerPage]
  );

  // Generate page numbers with memoization
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const halfVisible = Math.floor(MAX_VISIBLE_PAGES / 2);
    
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + MAX_VISIBLE_PAGES - 1);
    
    if (endPage - startPage + 1 < MAX_VISIBLE_PAGES) {
      startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }, [currentPage, totalPages]);

  // Debounced page change handler
  const handlePageChange = useCallback((page: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (page !== currentPage && page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    }, DEBOUNCE_DELAY);
  }, [currentPage, totalPages, onPageChange]);

  // Page size change handler
  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (onPageSizeChange && PAGE_SIZES.includes(newSize as typeof PAGE_SIZES[number])) {
      onPageSizeChange(newSize);
    }
  }, [onPageSizeChange]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowLeft':
        if (!rtl && currentPage > 1) handlePageChange(currentPage - 1);
        if (rtl && currentPage < totalPages) handlePageChange(currentPage + 1);
        break;
      case 'ArrowRight':
        if (!rtl && currentPage < totalPages) handlePageChange(currentPage + 1);
        if (rtl && currentPage > 1) handlePageChange(currentPage - 1);
        break;
      case 'Home':
        handlePageChange(1);
        break;
      case 'End':
        handlePageChange(totalPages);
        break;
    }
  }, [currentPage, totalPages, rtl, handlePageChange]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Container classes
  const containerClasses = classnames(
    'pagination',
    'flex',
    'items-center',
    'gap-2',
    'select-none',
    {
      'opacity-50': disabled || isLoading,
      'flex-row-reverse': rtl,
    },
    className
  );

  return (
    <nav
      ref={containerRef}
      className={containerClasses}
      aria-label={ariaLabel}
      data-testid={testId}
      dir={rtl ? 'rtl' : 'ltr'}
    >
      {/* Loading indicator */}
      {isLoading && (
        <div className="sr-only" role="status" aria-live="polite">
          {labels.loading}
        </div>
      )}

      {/* Page size selector */}
      {showPageSize && (
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize" className="text-sm">
            {labels.pageSize}:
          </label>
          <select
            id="pageSize"
            className="form-select text-sm min-w-[80px]"
            value={itemsPerPage}
            onChange={handlePageSizeChange}
            disabled={disabled || isLoading}
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation controls */}
      <div 
        className="flex items-center gap-1"
        role="group"
        aria-label={labels.currentPage}
        onKeyDown={handleKeyDown}
      >
        {/* Previous page button */}
        <Button
          variant="secondary"
          size="small"
          disabled={disabled || isLoading || currentPage === 1}
          onClick={() => handlePageChange(currentPage - 1)}
          ariaLabel={labels.previousPage}
        >
          {rtl ? '→' : '←'}
        </Button>

        {/* Page numbers */}
        {pageNumbers.map(page => (
          <Button
            key={page}
            variant={page === currentPage ? 'primary' : 'secondary'}
            size="small"
            disabled={disabled || isLoading}
            onClick={() => handlePageChange(page)}
            ariaLabel={`${labels.jumpTo} ${page}`}
            className={classnames('min-w-[40px]', {
              'font-semibold': page === currentPage,
            })}
          >
            {page}
          </Button>
        ))}

        {/* Next page button */}
        <Button
          variant="secondary"
          size="small"
          disabled={disabled || isLoading || currentPage === totalPages}
          onClick={() => handlePageChange(currentPage + 1)}
          ariaLabel={labels.nextPage}
        >
          {rtl ? '←' : '→'}
        </Button>
      </div>

      {/* Page info */}
      <div className="text-sm" aria-live="polite">
        {currentPage} {labels.totalPages} {totalPages}
      </div>
    </nav>
  );
});

Pagination.displayName = 'Pagination';

export default Pagination;