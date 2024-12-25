/**
 * @fileoverview Coverage analysis API service module
 * @version 1.0.0
 * @package @detection-platform/web
 * 
 * Implements coverage analysis operations with enhanced error handling,
 * retry logic, and monitoring capabilities as per technical specifications.
 */

import axios from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import {
  Coverage,
  CoverageCreatePayload,
  CoverageUpdatePayload,
  CoverageResponse,
  CoverageListResponse,
  isMitreId
} from '../../types/coverage';
import { API_ENDPOINTS, API_CONFIG, getApiUrl } from '../../config/api';
import { ERROR_CODES } from '../../config/constants';

// Cache configuration for coverage data
const COVERAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const coverageCache = new Map<string, { data: Coverage; timestamp: number }>();

/**
 * Analyzes coverage for a single detection with enhanced error handling and retry logic
 * @param detectionId - Unique identifier of the detection
 * @returns Promise resolving to coverage analysis results
 * @throws {Error} When analysis fails or validation errors occur
 */
export async function analyzeDetectionCoverage(
  detectionId: string
): Promise<CoverageResponse> {
  try {
    // Validate detection ID
    if (!detectionId || typeof detectionId !== 'string') {
      throw new Error('Invalid detection ID format');
    }

    // Configure axios instance with retry logic
    const axiosInstance = axios.create({
      ...API_CONFIG,
      timeout: 60000 // Extended timeout for analysis
    });

    axiosRetry(axiosInstance, {
      retries: 3,
      retryDelay: (retryCount) => retryCount * 1000,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          error.response?.status === 503;
      }
    });

    // Construct API URL
    const url = getApiUrl(API_ENDPOINTS.COVERAGE.ANALYZE.path);

    // Send analysis request
    const response = await axiosInstance.post<CoverageResponse>(url, {
      detection_id: detectionId
    });

    // Cache successful response
    if (response.data.status === 'success') {
      coverageCache.set(detectionId, {
        data: response.data.data,
        timestamp: Date.now()
      });
    }

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      switch (error.response?.status) {
        case 404:
          throw new Error(`Detection ${detectionId} not found`);
        case 429:
          throw new Error('Rate limit exceeded for coverage analysis');
        default:
          throw new Error(`Coverage analysis failed: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * Analyzes coverage for an entire detection library with batch processing
 * @param libraryId - Unique identifier of the library
 * @returns Promise resolving to aggregated coverage analysis
 * @throws {Error} When batch analysis fails
 */
export async function analyzeLibraryCoverage(
  libraryId: string
): Promise<CoverageResponse> {
  try {
    // Validate library ID
    if (!libraryId || typeof libraryId !== 'string') {
      throw new Error('Invalid library ID format');
    }

    // Configure axios instance with circuit breaker
    const axiosInstance = axios.create({
      ...API_CONFIG,
      timeout: 120000 // Extended timeout for batch processing
    });

    // Implement circuit breaker pattern
    let failureCount = 0;
    const maxFailures = 3;

    axiosRetry(axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        if (failureCount >= maxFailures) {
          return false; // Circuit breaker open
        }
        failureCount++;
        return axiosRetry.isNetworkOrIdempotentRequestError(error);
      }
    });

    const url = getApiUrl(API_ENDPOINTS.COVERAGE.ANALYZE.path);
    const response = await axiosInstance.post<CoverageResponse>(url, {
      library_id: libraryId,
      batch_size: 50 // Process in batches of 50
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === ERROR_CODES.DETECTION.COVERAGE_ERROR) {
        throw new Error('Coverage analysis failed due to invalid detection data');
      }
    }
    throw new Error(`Library coverage analysis failed: ${error}`);
  }
}

/**
 * Retrieves coverage gaps with recommendations and caching
 * @param entityId - ID of the entity (detection/library)
 * @param entityType - Type of entity ('detection' | 'library')
 * @returns Promise resolving to coverage gaps analysis
 */
export async function getCoverageGaps(
  entityId: string,
  entityType: 'detection' | 'library'
): Promise<Record<string, any>> {
  try {
    // Check cache first
    const cacheKey = `gaps_${entityType}_${entityId}`;
    const cached = coverageCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < COVERAGE_CACHE_TTL) {
      return cached.data;
    }

    const url = getApiUrl(API_ENDPOINTS.COVERAGE.REPORT.path);
    const response = await axios.get(url, {
      params: {
        entity_id: entityId,
        entity_type: entityType
      }
    });

    // Cache the new results
    coverageCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to retrieve coverage gaps: ${error}`);
  }
}

/**
 * Updates MITRE technique mappings with validation
 * @param detectionId - ID of the detection
 * @param updateData - Coverage update payload
 * @returns Promise resolving to updated coverage mapping
 */
export async function updateCoverageMapping(
  detectionId: string,
  updateData: CoverageUpdatePayload
): Promise<CoverageResponse> {
  try {
    // Validate MITRE IDs in update data
    if (updateData.metadata?.mitre_id && !isMitreId(updateData.metadata.mitre_id)) {
      throw new Error('Invalid MITRE ATT&CK ID format');
    }

    // Implement optimistic locking
    const url = getApiUrl(`${API_ENDPOINTS.COVERAGE.ANALYZE.path}/${detectionId}`);
    const response = await axios.put<CoverageResponse>(
      url,
      updateData,
      {
        headers: {
          'If-Match': updateData.metadata?.version || ''
        }
      }
    );

    // Invalidate relevant cache entries
    coverageCache.delete(detectionId);
    coverageCache.delete(`gaps_detection_${detectionId}`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      throw new Error('Coverage update conflict: The resource has been modified');
    }
    throw new Error(`Failed to update coverage mapping: ${error}`);
  }
}

// Export type definitions for external use
export type {
  Coverage,
  CoverageCreatePayload,
  CoverageUpdatePayload,
  CoverageResponse,
  CoverageListResponse
};