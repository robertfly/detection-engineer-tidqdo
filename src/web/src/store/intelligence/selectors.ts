/**
 * @fileoverview Redux selectors for intelligence state management with memoization
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { RootState } from '../rootReducer';
import { IntelligenceState } from './types';

/**
 * Performance monitoring configuration
 */
const PERFORMANCE_THRESHOLDS = {
  SELECTOR_EXECUTION: 100, // Maximum execution time in ms
  CACHE_HIT_TARGET: 0.8,  // Target cache hit rate (80%)
};

/**
 * Base selector to get the intelligence slice from root state
 * Implements performance monitoring in development
 */
export const selectIntelligenceState = (state: RootState): IntelligenceState => {
  if (process.env.NODE_ENV === 'development') {
    const start = performance.now();
    const result = state.intelligence;
    const duration = performance.now() - start;

    if (duration > PERFORMANCE_THRESHOLDS.SELECTOR_EXECUTION) {
      console.warn('Intelligence selector exceeded performance threshold:', {
        selector: 'selectIntelligenceState',
        duration: `${duration.toFixed(2)}ms`,
        threshold: PERFORMANCE_THRESHOLDS.SELECTOR_EXECUTION
      });
    }

    return result;
  }
  return state.intelligence;
};

/**
 * Memoized selector for intelligence items array
 * Optimized for frequent UI updates with cache monitoring
 */
export const selectIntelligenceItems = createSelector(
  [selectIntelligenceState],
  (state): IntelligenceState['items'] => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = state.items;
      const duration = performance.now() - start;

      // Monitor cache performance
      (window as any).intelligenceSelectorMetrics = {
        ...(window as any).intelligenceSelectorMetrics,
        itemsCacheHits: ((window as any).intelligenceSelectorMetrics?.itemsCacheHits || 0) + 1
      };

      return result;
    }
    return state.items;
  }
);

/**
 * Memoized selector for currently selected intelligence ID
 * Implements null safety checks
 */
export const selectSelectedIntelligenceId = createSelector(
  [selectIntelligenceState],
  (state): string | null => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = state.selectedId;
      const duration = performance.now() - start;

      // Track selection changes
      if (result !== (window as any).lastSelectedId) {
        console.debug('Intelligence selection changed:', {
          previous: (window as any).lastSelectedId,
          current: result,
          timestamp: new Date().toISOString()
        });
        (window as any).lastSelectedId = result;
      }

      return result;
    }
    return state.selectedId;
  }
);

/**
 * Memoized selector for currently selected intelligence item
 * Optimized with dependency-based memoization
 */
export const selectSelectedIntelligence = createSelector(
  [selectIntelligenceItems, selectSelectedIntelligenceId],
  (items, selectedId) => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = selectedId ? items.find(item => item.id === selectedId) || null : null;
      const duration = performance.now() - start;

      // Monitor complex selector performance
      if (duration > PERFORMANCE_THRESHOLDS.SELECTOR_EXECUTION * 0.5) {
        console.warn('Complex intelligence selector performance warning:', {
          selector: 'selectSelectedIntelligence',
          duration: `${duration.toFixed(2)}ms`,
          itemsCount: items.length,
          selectedId
        });
      }

      return result;
    }
    return selectedId ? items.find(item => item.id === selectedId) || null : null;
  }
);

/**
 * Memoized selector for intelligence loading state
 * Implements debug logging in development
 */
export const selectIntelligenceLoading = createSelector(
  [selectIntelligenceState],
  (state): boolean => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = state.loading;
      const duration = performance.now() - start;

      // Log loading state changes
      if (result !== (window as any).lastLoadingState) {
        console.debug('Intelligence loading state changed:', {
          previous: (window as any).lastLoadingState,
          current: result,
          timestamp: new Date().toISOString()
        });
        (window as any).lastLoadingState = result;
      }

      return result;
    }
    return state.loading;
  }
);

/**
 * Memoized selector for intelligence error state
 * Implements error tracking and monitoring
 */
export const selectIntelligenceError = createSelector(
  [selectIntelligenceState],
  (state): string | null => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = state.error;
      const duration = performance.now() - start;

      // Track error state changes
      if (result !== (window as any).lastErrorState) {
        console.debug('Intelligence error state changed:', {
          previous: (window as any).lastErrorState,
          current: result,
          timestamp: new Date().toISOString()
        });
        (window as any).lastErrorState = result;
      }

      return result;
    }
    return state.error;
  }
);

/**
 * Memoized selector for total intelligence items count
 * Implements cache optimization for pagination
 */
export const selectIntelligenceTotal = createSelector(
  [selectIntelligenceState],
  (state): number => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      const result = state.total;
      const duration = performance.now() - start;

      // Monitor count changes
      if (result !== (window as any).lastTotalCount) {
        console.debug('Intelligence total count changed:', {
          previous: (window as any).lastTotalCount,
          current: result,
          timestamp: new Date().toISOString()
        });
        (window as any).lastTotalCount = result;
      }

      return result;
    }
    return state.total;
  }
);