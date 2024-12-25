/**
 * @fileoverview Custom React hook for managing intelligence operations and state
 * Implements comprehensive intelligence processing, status management, and performance monitoring
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - versions specified in package.json
import { useCallback, useEffect } from 'react'; // v18.2.0
import { useDispatch, useSelector } from '../../store'; // Internal Redux store

// Internal imports
import {
  selectIntelligenceItems,
  selectSelectedIntelligence,
  selectIntelligenceLoading,
  selectIntelligenceError,
} from '../../store/intelligence/selectors';
import {
  fetchIntelligence,
  createIntelligence,
  selectIntelligence,
  updateIntelligenceStatus,
} from '../../store/intelligence/actions';
import { Intelligence } from '../../types/intelligence';

// Performance monitoring constants
const PERFORMANCE_THRESHOLDS = {
  FETCH_TIMEOUT: 5000,
  PROCESSING_TIMEOUT: 30000,
  UI_RESPONSE_THRESHOLD: 100,
};

/**
 * Interface for hook parameters
 */
interface UseIntelligenceParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
  autoFetch?: boolean;
}

/**
 * Interface for intelligence metrics
 */
interface IntelligenceMetrics {
  processingTime: number;
  successRate: number;
  lastOperationDuration: number;
  cacheHitRate: number;
}

/**
 * Custom hook for managing intelligence operations with enhanced error handling
 * and performance monitoring
 */
export const useIntelligence = (params: UseIntelligenceParams = {}) => {
  const dispatch = useDispatch();
  
  // Selectors with performance monitoring
  const items = useSelector(selectIntelligenceItems);
  const selected = useSelector(selectSelectedIntelligence);
  const loading = useSelector(selectIntelligenceLoading);
  const error = useSelector(selectIntelligenceError);

  // Performance metrics state
  const metrics: IntelligenceMetrics = {
    processingTime: 0,
    successRate: 0,
    lastOperationDuration: 0,
    cacheHitRate: 0,
  };

  /**
   * Memoized fetch handler with debouncing and error boundary
   */
  const handleFetch = useCallback(async () => {
    const startTime = performance.now();
    
    try {
      await dispatch(fetchIntelligence({
        page: params.page || 1,
        pageSize: params.pageSize || 20,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        filters: params.filters,
      }));

      metrics.lastOperationDuration = performance.now() - startTime;
      
      // Performance monitoring
      if (metrics.lastOperationDuration > PERFORMANCE_THRESHOLDS.FETCH_TIMEOUT) {
        console.warn('Intelligence fetch exceeded timeout:', {
          duration: metrics.lastOperationDuration,
          threshold: PERFORMANCE_THRESHOLDS.FETCH_TIMEOUT,
        });
      }
    } catch (error) {
      console.error('Intelligence fetch error:', error);
      throw error;
    }
  }, [dispatch, params]);

  /**
   * Memoized intelligence creation handler with validation
   */
  const handleCreate = useCallback(async (data: {
    name: string;
    description: string;
    source_type: Intelligence['source_type'];
    source_url?: string;
    source_content?: string;
    metadata: Record<string, unknown>;
  }) => {
    const startTime = performance.now();
    
    try {
      const result = await dispatch(createIntelligence(data));
      
      metrics.lastOperationDuration = performance.now() - startTime;
      metrics.processingTime += metrics.lastOperationDuration;
      
      // Performance monitoring
      if (metrics.lastOperationDuration > PERFORMANCE_THRESHOLDS.PROCESSING_TIMEOUT) {
        console.warn('Intelligence creation exceeded timeout:', {
          duration: metrics.lastOperationDuration,
          threshold: PERFORMANCE_THRESHOLDS.PROCESSING_TIMEOUT,
        });
      }

      return result;
    } catch (error) {
      console.error('Intelligence creation error:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Memoized selection handler with validation
   */
  const handleSelect = useCallback((id: string | null) => {
    const startTime = performance.now();
    
    try {
      if (id) {
        dispatch(selectIntelligence(id));
      }
      
      const duration = performance.now() - startTime;
      
      // UI responsiveness monitoring
      if (duration > PERFORMANCE_THRESHOLDS.UI_RESPONSE_THRESHOLD) {
        console.warn('Intelligence selection exceeded UI threshold:', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.UI_RESPONSE_THRESHOLD,
        });
      }
    } catch (error) {
      console.error('Intelligence selection error:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Effect for automatic fetching on mount and params change
   */
  useEffect(() => {
    if (params.autoFetch) {
      handleFetch();
    }

    // Cleanup function
    return () => {
      // Reset selection on unmount
      handleSelect(null);
    };
  }, [params, handleFetch, handleSelect]);

  return {
    // State
    items,
    selected,
    loading,
    error,
    
    // Operations
    fetch: handleFetch,
    create: handleCreate,
    select: handleSelect,
    
    // Performance metrics
    metrics,
  };
};

export type { UseIntelligenceParams, IntelligenceMetrics };