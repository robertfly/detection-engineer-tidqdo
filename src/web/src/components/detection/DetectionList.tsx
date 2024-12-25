import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0
import { useQuery, useQueryClient } from '@tanstack/react-query'; // v4.0.0
import { Detection, DetectionListResponse, DetectionFilter } from '../../types/detection';
import DetectionCard from './DetectionCard';
import ErrorBoundary from '../common/ErrorBoundary';
import Toast from '../common/Toast';

/**
 * Props interface for DetectionList component
 */
export interface DetectionListProps {
  /** Optional CSS class name */
  className?: string;
  /** Filter criteria for detections */
  filters: DetectionFilter;
  /** Handler for detection click */
  onDetectionClick?: (detection: Detection) => void;
  /** Handler for detection edit */
  onDetectionEdit?: (detection: Detection) => void;
  /** Handler for detection delete */
  onDetectionDelete?: (detection: Detection) => Promise<void>;
  /** Error handler */
  onError?: (error: Error) => void;
  /** Enable virtualization for large lists */
  virtualizeList?: boolean;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Loading state message */
  loadingMessage?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/**
 * Constants for list configuration
 */
const LIST_CONFIG = {
  PAGE_SIZE: 20,
  SCROLL_THRESHOLD: 0.8,
  ESTIMATED_ITEM_HEIGHT: 180,
  OVERSCAN_COUNT: 5,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
};

/**
 * A high-performance detection list component with virtualization support
 * and Material Design 3.0 specifications
 */
const DetectionList: React.FC<DetectionListProps> = ({
  className,
  filters,
  onDetectionClick,
  onDetectionEdit,
  onDetectionDelete,
  onError,
  virtualizeList = true,
  accessibilityLabel = 'Detection rules list',
  loadingMessage = 'Loading detection rules...',
  emptyMessage = 'No detection rules found',
}) => {
  // State management
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const parentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Query for fetching detections
  const { data, isLoading, error, isFetching } = useQuery<DetectionListResponse>({
    queryKey: ['detections', filters, page],
    keepPreviousData: true,
    retry: LIST_CONFIG.RETRY_COUNT,
    retryDelay: LIST_CONFIG.RETRY_DELAY,
  });

  // Memoized detections array
  const detections = useMemo(() => data?.items || [], [data?.items]);

  // Setup virtualizer
  const rowVirtualizer = useVirtualizer({
    count: detections.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LIST_CONFIG.ESTIMATED_ITEM_HEIGHT,
    overscan: LIST_CONFIG.OVERSCAN_COUNT,
    enabled: virtualizeList,
  });

  // Handle infinite scroll
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement || !hasNextPage || isFetching) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrollPercentage > LIST_CONFIG.SCROLL_THRESHOLD) {
        setPage(prev => prev + 1);
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetching]);

  // Update hasNextPage based on response
  useEffect(() => {
    if (data) {
      setHasNextPage(data.page < data.pages);
    }
  }, [data]);

  // Handle detection deletion with optimistic updates
  const handleDelete = useCallback(async (detection: Detection) => {
    if (!onDetectionDelete) return;

    try {
      // Optimistically remove from cache
      queryClient.setQueryData(['detections', filters, page], (old: DetectionListResponse | undefined) => ({
        ...old!,
        items: old!.items.filter(item => item.id !== detection.id),
        total: old!.total - 1,
      }));

      await onDetectionDelete(detection);

      // Show success toast
      <Toast
        id={`delete-success-${detection.id}`}
        message="Detection rule deleted successfully"
        variant="success"
        duration={3000}
      />;
    } catch (error) {
      // Revert optimistic update
      queryClient.invalidateQueries(['detections', filters, page]);
      
      // Show error toast
      <Toast
        id={`delete-error-${detection.id}`}
        message="Failed to delete detection rule"
        variant="error"
        duration={5000}
      />;

      onError?.(error as Error);
    }
  }, [onDetectionDelete, queryClient, filters, page, onError]);

  // Error handling
  if (error) {
    return (
      <div 
        role="alert" 
        className="p-4 text-error-600 bg-error-50 rounded-lg"
      >
        <h3 className="text-lg font-semibold mb-2">Error loading detections</h3>
        <p>{(error as Error).message}</p>
        <button
          onClick={() => queryClient.invalidateQueries(['detections', filters, page])}
          className="mt-4 px-4 py-2 bg-error-600 text-white rounded hover:bg-error-700 focus:ring-2 focus:ring-error-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary onError={onError}>
      <div
        ref={parentRef}
        className={`detection-list relative overflow-auto h-full ${className}`}
        role="region"
        aria-label={accessibilityLabel}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <div role="status" className="flex items-center justify-center p-8">
            <span className="sr-only">{loadingMessage}</span>
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : detections.length === 0 ? (
          <div role="status" className="flex items-center justify-center p-8 text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const detection = detections[virtualRow.index];
              return (
                <div
                  key={detection.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <DetectionCard
                    detection={detection}
                    onClick={onDetectionClick}
                    onEdit={onDetectionEdit}
                    onDelete={handleDelete}
                    className="m-4"
                    testId={`detection-${detection.id}`}
                  />
                </div>
              );
            })}
          </div>
        )}
        {isFetching && hasNextPage && (
          <div role="status" className="flex justify-center p-4">
            <span className="sr-only">Loading more...</span>
            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

DetectionList.displayName = 'DetectionList';

export default DetectionList;