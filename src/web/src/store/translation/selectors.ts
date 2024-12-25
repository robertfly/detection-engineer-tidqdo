/**
 * @fileoverview Redux selectors for translation state management with memoization
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { RootState } from '../rootReducer';
import { TranslationState } from './types';

/**
 * Base selector for accessing translation state slice
 * Provides type-safe access to translation state
 * @param state - Root Redux state
 * @returns Translation state slice
 */
export const selectTranslationState = (state: RootState): TranslationState => state.translation;

/**
 * Memoized selector for accessing all translations
 * Optimizes re-renders by maintaining referential equality
 */
export const selectTranslations = createSelector(
  [selectTranslationState],
  (state: TranslationState) => state.translations
);

/**
 * Memoized selector for currently selected translation ID
 * Used for tracking active translation in UI
 */
export const selectSelectedTranslationId = createSelector(
  [selectTranslationState],
  (state: TranslationState) => state.selectedTranslationId
);

/**
 * Memoized selector for currently selected translation
 * Combines translations and selected ID for efficient lookup
 */
export const selectSelectedTranslation = createSelector(
  [selectTranslations, selectSelectedTranslationId],
  (translations, selectedId) => {
    if (!selectedId) return null;
    return translations.find(translation => translation.id === selectedId) || null;
  }
);

/**
 * Memoized selector for filtering translations by detection ID
 * Supports efficient translation management per detection
 * @param state - Root Redux state
 * @param detectionId - ID of detection to filter by
 * @returns Array of translations for the specified detection
 */
export const selectTranslationsByDetectionId = createSelector(
  [selectTranslations, (_state: RootState, detectionId: string) => detectionId],
  (translations, detectionId) => 
    translations.filter(translation => translation.detection_id === detectionId)
);

/**
 * Memoized selector for translation loading state
 * Used for managing loading indicators in UI
 */
export const selectTranslationLoading = createSelector(
  [selectTranslationState],
  (state: TranslationState) => state.loading
);

/**
 * Memoized selector for translation error state
 * Provides type-safe access to error information
 */
export const selectTranslationError = createSelector(
  [selectTranslationState],
  (state: TranslationState) => state.error
);

/**
 * Memoized selector for translation performance metrics
 * Provides access to success rate and processing time
 */
export const selectTranslationMetrics = createSelector(
  [selectTranslationState],
  (state: TranslationState) => ({
    successRate: state.successRate,
    processingTime: state.processingTime,
    total: state.total
  })
);

/**
 * Type guard to validate translation array
 * @param translations - Array to validate
 * @returns Boolean indicating if array contains valid translations
 */
const isValidTranslationArray = (translations: unknown[]): boolean => {
  return translations.every(translation => 
    translation && 
    typeof translation === 'object' && 
    'id' in translation &&
    'detection_id' in translation
  );
};

/**
 * Memoized selector for validated translations
 * Ensures type safety of translation data
 */
export const selectValidatedTranslations = createSelector(
  [selectTranslations],
  (translations) => {
    if (!isValidTranslationArray(translations)) {
      console.error('Invalid translation data detected');
      return [];
    }
    return translations;
  }
);