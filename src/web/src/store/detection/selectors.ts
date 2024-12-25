/**
 * @fileoverview Redux selectors for detection state management with memoization
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { RootState } from '../rootReducer';
import { Detection } from '../../types/detection';
import { DetectionState } from './types';

/**
 * Base selector to get the detection state slice
 * Provides type-safe access to detection state
 */
export const selectDetectionState = (state: RootState): DetectionState => state.detection;

/**
 * Memoized selector to get all detections as an array
 * Maintains referential equality for unchanged data
 */
export const selectDetections = createSelector(
  [selectDetectionState],
  (state: DetectionState): Detection[] => {
    return Object.values(state.detections);
  }
);

/**
 * Memoized selector to get currently selected detection
 * Handles null safety and maintains referential equality
 */
export const selectSelectedDetection = createSelector(
  [selectDetectionState],
  (state: DetectionState): Detection | null => {
    if (!state.selectedId) return null;
    return state.detections[state.selectedId] || null;
  }
);

/**
 * Memoized selector for filtered detections with optimized performance
 * Implements comprehensive filtering based on current filter state
 */
export const selectFilteredDetections = createSelector(
  [selectDetections, selectDetectionState],
  (detections: Detection[], state: DetectionState): Detection[] => {
    const { filters } = state;
    
    return detections.filter(detection => {
      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(detection.status)) {
        return false;
      }

      // Platform filter
      if (filters.platform.length > 0 && !filters.platform.includes(detection.platform)) {
        return false;
      }

      // Library filter
      if (filters.library_id && detection.library_id !== filters.library_id) {
        return false;
      }

      // MITRE tactics filter
      if (filters.mitreTactics.length > 0) {
        const detectionTactics = Object.keys(detection.mitre_mapping);
        if (!filters.mitreTactics.some(tactic => detectionTactics.includes(tactic))) {
          return false;
        }
      }

      // MITRE techniques filter
      if (filters.mitreTechniques.length > 0) {
        const detectionTechniques = Object.values(detection.mitre_mapping).flat();
        if (!filters.mitreTechniques.some(technique => detectionTechniques.includes(technique))) {
          return false;
        }
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const detectionTags = detection.metadata.tags || [];
        if (!filters.tags.some(tag => detectionTags.includes(tag))) {
          return false;
        }
      }

      // Author filter
      if (filters.author && detection.creator_id !== filters.author) {
        return false;
      }

      // Search text filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableContent = [
          detection.name,
          detection.description,
          JSON.stringify(detection.logic),
          ...(detection.metadata.tags || [])
        ].join(' ').toLowerCase();
        
        if (!searchableContent.includes(searchLower)) {
          return false;
        }
      }

      return true;
    });
  }
);

/**
 * Selector to get detection loading state
 * Used for UI loading indicators
 */
export const selectDetectionLoading = createSelector(
  [selectDetectionState],
  (state: DetectionState): boolean => {
    return Object.values(state.loading).some(loading => loading);
  }
);

/**
 * Selector to get detection error state
 * Used for error handling and display
 */
export const selectDetectionError = createSelector(
  [selectDetectionState],
  (state: DetectionState): string | null => {
    return state.error?.message || null;
  }
);

/**
 * Selector to get detection pagination state
 * Used for paginated list views
 */
export const selectDetectionPagination = createSelector(
  [selectDetectionState],
  (state: DetectionState) => state.pagination
);

/**
 * Selector to get current detection filters
 * Used for filter UI state management
 */
export const selectDetectionFilters = createSelector(
  [selectDetectionState],
  (state: DetectionState) => state.filters
);

/**
 * Selector to get total number of detections
 * Used for pagination and statistics
 */
export const selectTotalDetections = createSelector(
  [selectDetectionState],
  (state: DetectionState): number => {
    return Object.keys(state.detections).length;
  }
);