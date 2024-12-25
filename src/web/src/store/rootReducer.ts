/**
 * @fileoverview Root Redux reducer combining all feature reducers
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { combineReducers } from '@reduxjs/toolkit'; // v1.9.0+

// Feature reducers
import { authReducer } from './auth/reducer';
import { detectionReducer } from './detection/reducer';
import { intelligenceReducer } from './intelligence/reducer';
import { coverageReducer } from './coverage/reducer';
import { libraryReducer } from './library/reducer';
import { translationReducer } from './translation/reducer';

/**
 * Root state type combining all feature states
 * Provides type safety for the entire Redux store
 */
export interface RootState {
  auth: ReturnType<typeof authReducer>;
  detection: ReturnType<typeof detectionReducer>;
  intelligence: ReturnType<typeof intelligenceReducer>;
  coverage: ReturnType<typeof coverageReducer>;
  library: ReturnType<typeof libraryReducer>;
  translation: ReturnType<typeof translationReducer>;
}

/**
 * Performance monitoring decorator for Redux state updates
 * Tracks update times and logs warnings for slow updates
 */
const withPerformanceTracking = (reducer: typeof rootReducer) => {
  return (state: RootState | undefined, action: any) => {
    const start = performance.now();
    const newState = reducer(state, action);
    const duration = performance.now() - start;

    // Log warning if state update takes longer than 16ms (targeting 60fps)
    if (duration > 16) {
      console.warn('Slow state update detected:', {
        action: action.type,
        duration: `${duration.toFixed(2)}ms`,
        timestamp: new Date().toISOString()
      });
    }

    return newState;
  };
};

/**
 * Error boundary decorator for Redux reducers
 * Catches and logs errors during state updates
 */
const withErrorBoundary = (reducer: typeof rootReducer) => {
  return (state: RootState | undefined, action: any) => {
    try {
      return reducer(state, action);
    } catch (error) {
      // Log error with context for debugging
      console.error('Redux state update error:', {
        action: action.type,
        error,
        state: state ? Object.keys(state) : 'undefined',
        timestamp: new Date().toISOString()
      });

      // Return previous state to maintain stability
      return state || reducer(undefined, { type: '@@INIT' });
    }
  };
};

/**
 * Root reducer combining all feature reducers
 * Implements performance monitoring and error handling
 */
const rootReducer = combineReducers<RootState>({
  auth: authReducer,
  detection: detectionReducer,
  intelligence: intelligenceReducer,
  coverage: coverageReducer,
  library: libraryReducer,
  translation: translationReducer
});

/**
 * Enhanced root reducer with performance tracking and error handling
 * Exports the final reducer with all middleware applied
 */
export default withErrorBoundary(withPerformanceTracking(rootReducer));

/**
 * Type-safe selector helpers for accessing state slices
 */
export const selectAuth = (state: RootState) => state.auth;
export const selectDetection = (state: RootState) => state.detection;
export const selectIntelligence = (state: RootState) => state.intelligence;
export const selectCoverage = (state: RootState) => state.coverage;
export const selectLibrary = (state: RootState) => state.library;
export const selectTranslation = (state: RootState) => state.translation;