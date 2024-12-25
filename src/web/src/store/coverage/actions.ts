/**
 * @fileoverview Redux action creators for coverage analysis state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { Dispatch } from 'redux';
import {
  CoverageActionTypes,
  CoverageAction,
  CoverageMatrix
} from './types';
import {
  analyzeDetectionCoverage,
  analyzeLibraryCoverage,
  getCoverageGaps,
  updateCoverageMapping
} from '../../services/api/coverage';
import { ERROR_CODES } from '../../config/constants';

// Cache configuration
const COVERAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const coverageRequestCache = new Map<string, number>();

/**
 * Action creator for initiating coverage fetch request
 * @returns Action indicating coverage fetch request initiation
 */
export const fetchCoverageRequest = (): CoverageAction => ({
  type: CoverageActionTypes.FETCH_COVERAGE_REQUEST
});

/**
 * Action creator for successful coverage fetch
 * @param coverageData - Coverage matrix data from API
 * @returns Action with coverage data payload
 */
export const fetchCoverageSuccess = (coverageData: CoverageMatrix): CoverageAction => ({
  type: CoverageActionTypes.FETCH_COVERAGE_SUCCESS,
  payload: coverageData
});

/**
 * Action creator for coverage fetch failure
 * @param error - Error message from failed fetch
 * @returns Action with error payload
 */
export const fetchCoverageFailure = (error: string): CoverageAction => ({
  type: CoverageActionTypes.FETCH_COVERAGE_FAILURE,
  payload: error
});

/**
 * Enhanced thunk action creator for fetching detection coverage
 * Implements caching, retry logic, and error handling
 * @param detectionId - Unique identifier of the detection
 */
export const fetchDetectionCoverage = (detectionId: string) => {
  return async (dispatch: Dispatch<CoverageAction>) => {
    try {
      // Validate detection ID
      if (!detectionId || typeof detectionId !== 'string') {
        throw new Error('Invalid detection ID format');
      }

      // Check cache to prevent duplicate requests
      const lastFetchTime = coverageRequestCache.get(detectionId);
      if (lastFetchTime && Date.now() - lastFetchTime < COVERAGE_CACHE_TTL) {
        return; // Use cached data
      }

      dispatch(fetchCoverageRequest());
      coverageRequestCache.set(detectionId, Date.now());

      // Fetch coverage data with retry logic built into API service
      const response = await analyzeDetectionCoverage(detectionId);

      if (response.status === 'success' && response.data) {
        dispatch(fetchCoverageSuccess(response.data));
      } else {
        throw new Error('Invalid coverage response format');
      }
    } catch (error) {
      // Clear cache on error
      coverageRequestCache.delete(detectionId);

      let errorMessage = 'Failed to fetch detection coverage';
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limit')) {
          errorMessage = `Rate limit exceeded. Please try again later. (Code: ${ERROR_CODES.API.RATE_LIMIT_EXCEEDED})`;
        } else if (error.message.includes('not found')) {
          errorMessage = `Detection ${detectionId} not found. (Code: ${ERROR_CODES.DETECTION.INVALID_FORMAT})`;
        } else {
          errorMessage = `${errorMessage}: ${error.message}`;
        }
      }

      dispatch(fetchCoverageFailure(errorMessage));
    }
  };
};

/**
 * Enhanced thunk action creator for fetching library coverage
 * Implements batch processing and progress tracking
 * @param libraryId - Unique identifier of the library
 */
export const fetchLibraryCoverage = (libraryId: string) => {
  return async (dispatch: Dispatch<CoverageAction>) => {
    try {
      // Validate library ID
      if (!libraryId || typeof libraryId !== 'string') {
        throw new Error('Invalid library ID format');
      }

      // Check cache
      const lastFetchTime = coverageRequestCache.get(`lib_${libraryId}`);
      if (lastFetchTime && Date.now() - lastFetchTime < COVERAGE_CACHE_TTL) {
        return;
      }

      dispatch(fetchCoverageRequest());
      coverageRequestCache.set(`lib_${libraryId}`, Date.now());

      // Fetch library coverage with batch processing
      const response = await analyzeLibraryCoverage(libraryId);

      if (response.status === 'success' && response.data) {
        // Get coverage gaps for comprehensive analysis
        const gaps = await getCoverageGaps(libraryId, 'library');
        
        // Merge coverage data with gaps analysis
        const enrichedCoverage = {
          ...response.data,
          gaps,
          lastUpdated: Date.now()
        };

        dispatch(fetchCoverageSuccess(enrichedCoverage));
      } else {
        throw new Error('Invalid library coverage response format');
      }
    } catch (error) {
      // Clear cache on error
      coverageRequestCache.delete(`lib_${libraryId}`);

      let errorMessage = 'Failed to fetch library coverage';
      
      if (error instanceof Error) {
        if (error.message.includes('Circuit breaker')) {
          errorMessage = `Service temporarily unavailable. Please try again later. (Code: ${ERROR_CODES.API.SERVICE_UNAVAILABLE})`;
        } else {
          errorMessage = `${errorMessage}: ${error.message}`;
        }
      }

      dispatch(fetchCoverageFailure(errorMessage));
    }
  };
};

/**
 * Action creator for resetting coverage state
 * @returns Action for resetting coverage state
 */
export const resetCoverage = (): CoverageAction => ({
  type: CoverageActionTypes.RESET_COVERAGE
});