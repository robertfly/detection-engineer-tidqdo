import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // v6.4.0
import TranslationCard from '../../components/translation/TranslationCard';
import Pagination from '../../components/common/Pagination';
import useTranslation from '../../hooks/useTranslation';

// Constants for pagination and performance optimization
const ITEMS_PER_PAGE = 20;
const GRID_COLUMNS = {
  sm: 1,
  md: 2,
  lg: 3
} as const;
const RATE_LIMIT_DELAY = 100;
const MIN_QUERY_LENGTH = 3;

// Interface for component props
interface TranslationListProps {
  className?: string;
  filter?: TranslationFilter;
  sortBy?: SortOptions;
  viewMode?: ViewMode;
}

// Interface for filter options
interface TranslationFilter {
  platforms: string[];
  statuses: string[];
  dateRange: DateRange;
}

// Interface for date range filter
interface DateRange {
  start: Date | null;
  end: Date | null;
}

type ViewMode = 'grid' | 'list';
type SortOptions = 'date' | 'platform' | 'status' | 'accuracy';

/**
 * Enhanced translation list page component with virtualization and accessibility
 */
const TranslationList: React.FC<TranslationListProps> = React.memo(({
  className,
  filter,
  sortBy = 'date',
  viewMode = 'grid'
}) => {
  // Hooks
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Custom hook for translation management
  const {
    translations,
    loading,
    error,
    metrics,
    fetchTranslations,
    validateAccuracy
  } = useTranslation('', {
    autoValidate: true,
    performanceMonitoring: true,
    rateLimitThreshold: 10
  });

  // Memoized filtered and sorted translations
  const filteredTranslations = useMemo(() => {
    let result = [...translations];

    // Apply filters
    if (filter) {
      result = result.filter(translation => {
        const platformMatch = !filter.platforms.length || 
          filter.platforms.includes(translation.platform);
        const statusMatch = !filter.statuses.length || 
          filter.statuses.includes(translation.status);
        const dateMatch = !filter.dateRange.start || !filter.dateRange.end || 
          (new Date(translation.created_at) >= filter.dateRange.start &&
           new Date(translation.created_at) <= filter.dateRange.end);
        
        return platformMatch && statusMatch && dateMatch;
      });
    }

    // Apply search
    if (debouncedQuery && debouncedQuery.length >= MIN_QUERY_LENGTH) {
      result = result.filter(translation =>
        translation.platform.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        translation.translated_logic.toLowerCase().includes(debouncedQuery.toLowerCase())
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'platform':
          return a.platform.localeCompare(b.platform);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'accuracy':
          return b.metadata.accuracy_score - a.metadata.accuracy_score;
        default:
          return 0;
      }
    });

    return result;
  }, [translations, filter, debouncedQuery, sortBy]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTranslations.length / ITEMS_PER_PAGE);
  const paginatedTranslations = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTranslations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTranslations, currentPage]);

  // Debounced search handler
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, RATE_LIMIT_DELAY);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handlers
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleTranslationView = useCallback((translation: Translation) => {
    navigate(`/translations/${translation.id}`);
  }, [navigate]);

  const handleTranslationCopy = useCallback(async (translation: Translation) => {
    try {
      await navigator.clipboard.writeText(translation.translated_logic);
    } catch (error) {
      console.error('Failed to copy translation:', error);
    }
  }, []);

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <span className="sr-only">Loading translations...</span>
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="bg-gray-200 rounded-lg h-32 w-full max-w-2xl"
            />
          ))}
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div 
        className="text-error-500 p-4 rounded-lg bg-error-50" 
        role="alert"
        aria-live="polite"
      >
        <h2 className="text-lg font-semibold mb-2">Error Loading Translations</h2>
        <p>{error}</p>
        <button
          className="mt-4 btn btn-primary"
          onClick={() => fetchTranslations()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Metrics Summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
          <p className="mt-1 text-2xl font-semibold text-primary-600">
            {metrics.successRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Translations</h3>
          <p className="mt-1 text-2xl font-semibold text-primary-600">
            {translations.length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Avg. Processing Time</h3>
          <p className="mt-1 text-2xl font-semibold text-primary-600">
            {metrics.averageTranslationTime.toFixed(0)}ms
          </p>
        </div>
      </div>

      {/* Translation Grid/List */}
      <div
        className={`grid gap-6 ${
          viewMode === 'grid'
            ? `grid-cols-1 md:grid-cols-${GRID_COLUMNS.md} lg:grid-cols-${GRID_COLUMNS.lg}`
            : 'grid-cols-1'
        }`}
        role="region"
        aria-label="Translation list"
      >
        {paginatedTranslations.map(translation => (
          <TranslationCard
            key={translation.id}
            translation={translation}
            onView={handleTranslationView}
            onCopy={handleTranslationCopy}
            showAccuracy
            elevation={1}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            totalItems={filteredTranslations.length}
            itemsPerPage={ITEMS_PER_PAGE}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            showPageSize
            ariaLabel="Translation list pagination"
          />
        </div>
      )}
    </div>
  );
});

TranslationList.displayName = 'TranslationList';

export default TranslationList;
export type { TranslationListProps, TranslationFilter };