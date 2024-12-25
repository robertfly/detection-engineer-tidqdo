/**
 * @fileoverview High-performance intelligence list component with virtualization
 * Implements responsive grid layout, real-time status updates, and accessibility
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useMemo } from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0

// Internal imports
import IntelligenceCard, { IntelligenceCardProps } from './IntelligenceCard';
import { useIntelligence } from '../../hooks/useIntelligence';
import Loading from '../common/Loading';

// Performance monitoring constants
const PERFORMANCE_THRESHOLDS = {
  RENDER_TIME: 16, // Target 60fps
  INTERACTION_DELAY: 100,
  BATCH_SIZE: 20
};

interface IntelligenceListProps {
  /** Additional CSS classes */
  className?: string;
  /** Filter criteria for intelligence items */
  filters?: Record<string, any>;
  /** Callback for viewing intelligence details */
  onView: (id: string) => void;
  /** Callback for stopping intelligence processing */
  onStop?: (id: string) => void;
  /** Callback for retrying failed intelligence */
  onRetry?: (id: string) => void;
  /** Callback for batch operations */
  onBatchAction?: (ids: string[], action: string) => void;
  /** Performance configuration */
  performanceConfig?: {
    enableVirtualization?: boolean;
    itemHeight?: number;
    overscan?: number;
  };
  /** Accessibility configuration */
  a11yConfig?: {
    announceUpdates?: boolean;
    labelledBy?: string;
    describedBy?: string;
  };
}

/**
 * High-performance intelligence list component with virtualization support
 * Implements responsive grid layout and real-time status updates
 */
const IntelligenceList: React.FC<IntelligenceListProps> = React.memo(({
  className,
  filters,
  onView,
  onStop,
  onRetry,
  onBatchAction,
  performanceConfig = {
    enableVirtualization: true,
    itemHeight: 200,
    overscan: 5
  },
  a11yConfig = {
    announceUpdates: true,
    labelledBy: 'intelligence-list-title',
    describedBy: 'intelligence-list-description'
  }
}) => {
  // Fetch intelligence data with performance monitoring
  const { items, loading, error, metrics } = useIntelligence({
    autoFetch: true,
    filters
  });

  // Container ref for virtualization
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Configure virtualizer for performance optimization
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => performanceConfig.itemHeight!,
    overscan: performanceConfig.overscan,
    enabled: performanceConfig.enableVirtualization && items.length > PERFORMANCE_THRESHOLDS.BATCH_SIZE
  });

  // Memoized handlers with performance tracking
  const handleView = useCallback((id: string) => {
    const start = performance.now();
    onView(id);
    const duration = performance.now() - start;

    if (duration > PERFORMANCE_THRESHOLDS.INTERACTION_DELAY) {
      console.warn('View interaction exceeded threshold:', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.INTERACTION_DELAY
      });
    }
  }, [onView]);

  const handleStop = useCallback((id: string) => {
    if (onStop) {
      const start = performance.now();
      onStop(id);
      const duration = performance.now() - start;

      if (duration > PERFORMANCE_THRESHOLDS.INTERACTION_DELAY) {
        console.warn('Stop interaction exceeded threshold:', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.INTERACTION_DELAY
        });
      }
    }
  }, [onStop]);

  const handleRetry = useCallback((id: string) => {
    if (onRetry) {
      const start = performance.now();
      onRetry(id);
      const duration = performance.now() - start;

      if (duration > PERFORMANCE_THRESHOLDS.INTERACTION_DELAY) {
        console.warn('Retry interaction exceeded threshold:', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.INTERACTION_DELAY
        });
      }
    }
  }, [onRetry]);

  // Announce status updates for screen readers
  useEffect(() => {
    if (a11yConfig.announceUpdates && items.length > 0) {
      const message = `${items.length} intelligence items loaded`;
      const utterance = new SpeechSynthesisUtterance(message);
      window.speechSynthesis.speak(utterance);
    }
  }, [items.length, a11yConfig.announceUpdates]);

  // Render virtualized list items
  const virtualItems = useMemo(() => {
    return rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const item = items[virtualRow.index];
      return (
        <div
          key={item.id}
          data-index={virtualRow.index}
          ref={rowVirtualizer.measureElement}
          className="p-2"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`
          }}
        >
          <IntelligenceCard
            intelligence={item}
            onView={handleView}
            onStop={handleStop}
            onRetry={handleRetry}
            testId={`intelligence-card-${item.id}`}
          />
        </div>
      );
    });
  }, [rowVirtualizer, items, handleView, handleStop, handleRetry]);

  // Handle loading and error states
  if (loading) {
    return (
      <div className={classNames('loading', className)}>
        <Loading size="large" label="Loading intelligence items..." center />
      </div>
    );
  }

  if (error) {
    return (
      <div className={classNames('error', className)} role="alert">
        <p className="text-red-500">Error loading intelligence items: {error}</p>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'container',
        'relative',
        className
      )}
      role="region"
      aria-labelledby={a11yConfig.labelledBy}
      aria-describedby={a11yConfig.describedBy}
    >
      <div
        ref={parentRef}
        className={classNames(
          'virtualList',
          'grid',
          'grid-cols-1',
          'md:grid-cols-2',
          'lg:grid-cols-3',
          'gap-4',
          'p-4'
        )}
        style={{
          height: '100%',
          width: '100%',
          overflow: 'auto'
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualItems}
        </div>
      </div>
    </div>
  );
});

// Display name for debugging
IntelligenceList.displayName = 'IntelligenceList';

export default IntelligenceList;
export type { IntelligenceListProps };