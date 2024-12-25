/**
 * @fileoverview React hook for managing coverage analysis operations and state
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { useState, useCallback, useEffect } from 'react'; // v18.2.0
import {
  analyzeDetectionCoverage,
  analyzeLibraryCoverage,
  getCoverageGaps,
  updateCoverageMapping
} from '../services/api/coverage';
import {
  Coverage,
  CoverageResponse,
  CoverageListResponse,
  CoverageUpdatePayload
} from '../types/coverage';

// Custom error type for coverage operations
interface CoverageError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Loading state type for granular operation tracking
type LoadingState = {
  analyze: boolean;
  gaps: boolean;
  update: boolean;
};

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const coverageCache = new Map<string, { data: Coverage; timestamp: number }>();

/**
 * Custom hook for managing coverage analysis operations and state
 * @returns Object containing coverage state and operations
 */
export function useCoverage() {
  // State management with proper typing
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState<LoadingState>({
    analyze: false,
    gaps: false,
    update: false
  });
  const [error, setError] = useState<CoverageError | null>(null);

  // Cache invalidation effect
  useEffect(() => {
    const cleanupCache = () => {
      const now = Date.now();
      coverageCache.forEach((value, key) => {
        if (now - value.timestamp > CACHE_TTL) {
          coverageCache.delete(key);
        }
      });
    };

    const interval = setInterval(cleanupCache, CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  /**
   * Analyzes coverage for a single detection with error handling and caching
   */
  const analyzeDetection = useCallback(async (detectionId: string) => {
    try {
      setLoading(prev => ({ ...prev, analyze: true }));
      setError(null);

      // Check cache first
      const cached = coverageCache.get(detectionId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setCoverage(cached.data);
        return cached.data;
      }

      const response = await analyzeDetectionCoverage(detectionId);
      if (response.status === 'success') {
        setCoverage(response.data);
        coverageCache.set(detectionId, {
          data: response.data,
          timestamp: Date.now()
        });
        return response.data;
      }
    } catch (err) {
      const error = err as Error;
      setError({
        code: 'COVERAGE_ANALYSIS_ERROR',
        message: error.message,
        details: { detectionId }
      });
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, analyze: false }));
    }
  }, []);

  /**
   * Analyzes coverage for an entire library with optimistic updates
   */
  const analyzeLibrary = useCallback(async (libraryId: string) => {
    try {
      setLoading(prev => ({ ...prev, analyze: true }));
      setError(null);

      const response = await analyzeLibraryCoverage(libraryId);
      if (response.status === 'success') {
        setCoverage(response.data);
        return response.data;
      }
    } catch (err) {
      const error = err as Error;
      setError({
        code: 'LIBRARY_ANALYSIS_ERROR',
        message: error.message,
        details: { libraryId }
      });
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, analyze: false }));
    }
  }, []);

  /**
   * Retrieves coverage gaps with caching integration
   */
  const getGaps = useCallback(async (
    entityId: string,
    entityType: 'detection' | 'library'
  ) => {
    try {
      setLoading(prev => ({ ...prev, gaps: true }));
      setError(null);

      const gaps = await getCoverageGaps(entityId, entityType);
      return gaps;
    } catch (err) {
      const error = err as Error;
      setError({
        code: 'COVERAGE_GAPS_ERROR',
        message: error.message,
        details: { entityId, entityType }
      });
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, gaps: false }));
    }
  }, []);

  /**
   * Updates coverage mapping with validation and optimistic updates
   */
  const updateMapping = useCallback(async (
    detectionId: string,
    updateData: CoverageUpdatePayload
  ) => {
    try {
      setLoading(prev => ({ ...prev, update: true }));
      setError(null);

      // Optimistic update
      if (coverage) {
        const optimisticCoverage = {
          ...coverage,
          ...updateData
        };
        setCoverage(optimisticCoverage);
      }

      const response = await updateCoverageMapping(detectionId, updateData);
      if (response.status === 'success') {
        setCoverage(response.data);
        // Invalidate relevant cache entries
        coverageCache.delete(detectionId);
        return response.data;
      }
    } catch (err) {
      const error = err as Error;
      // Revert optimistic update on error
      if (coverage) {
        setCoverage(coverage);
      }
      setError({
        code: 'COVERAGE_UPDATE_ERROR',
        message: error.message,
        details: { detectionId, updateData }
      });
      throw error;
    } finally {
      setLoading(prev => ({ ...prev, update: false }));
    }
  }, [coverage]);

  /**
   * Clears current error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Forces cache invalidation for specific entries
   */
  const invalidateCache = useCallback((detectionId?: string) => {
    if (detectionId) {
      coverageCache.delete(detectionId);
    } else {
      coverageCache.clear();
    }
  }, []);

  return {
    coverage,
    loading,
    error,
    analyzeDetection,
    analyzeLibrary,
    getGaps,
    updateMapping,
    clearError,
    invalidateCache
  };
}