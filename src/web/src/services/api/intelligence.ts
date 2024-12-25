/**
 * @fileoverview Intelligence API service for handling intelligence-related operations
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import axios, { AxiosProgressEvent } from 'axios'; // v1.6.0

// Internal imports
import {
  Intelligence,
  IntelligenceCreate,
  IntelligenceUpdate,
  IntelligenceResponse,
  IntelligenceListResponse,
  IntelligenceSourceType,
  IntelligenceStatus
} from '../../types/intelligence';
import { API_ENDPOINTS } from '../../config/api';
import { PaginationParams, ApiResponse } from '../../types/api';

/**
 * Interface for intelligence processing options
 */
interface ProcessingOptions {
  /** Minimum required accuracy threshold (0-100) */
  accuracyThreshold: number;
  /** Maximum processing time in milliseconds */
  processingTimeout: number;
  /** Enable detailed validation reporting */
  detailedValidation: boolean;
  /** Source-specific processing options */
  sourceOptions?: {
    /** PDF-specific options */
    pdf?: {
      ocrEnabled: boolean;
      imageQuality: number;
    };
    /** URL-specific options */
    url?: {
      followRedirects: boolean;
      maxDepth: number;
    };
    /** Image analysis options */
    image?: {
      enhanceResolution: boolean;
      detectText: boolean;
    };
  };
}

/**
 * Interface for intelligence list filters
 */
interface IntelligenceFilters extends PaginationParams {
  sourceType?: IntelligenceSourceType;
  status?: IntelligenceStatus;
  minAccuracy?: number;
  maxProcessingTime?: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * Default processing options based on technical specifications
 */
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  accuracyThreshold: 85, // Minimum 85% accuracy as per specs
  processingTimeout: 120000, // 2 minutes maximum processing time
  detailedValidation: true,
  sourceOptions: {
    pdf: {
      ocrEnabled: true,
      imageQuality: 300
    },
    url: {
      followRedirects: true,
      maxDepth: 2
    },
    image: {
      enhanceResolution: true,
      detectText: true
    }
  }
};

/**
 * Retrieves a paginated list of intelligence items with filtering
 * @param filters - Optional filters for intelligence list
 * @returns Promise with paginated intelligence list
 */
export async function getIntelligenceList(
  filters: IntelligenceFilters = { page: 1, limit: 20 }
): Promise<IntelligenceListResponse> {
  try {
    const response = await axios.get<IntelligenceListResponse>(
      API_ENDPOINTS.INTELLIGENCE.LIST.path,
      {
        params: {
          ...filters,
          minAccuracy: filters.minAccuracy ?? 0,
          maxProcessingTime: filters.maxProcessingTime ?? 300000
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Failed to fetch intelligence list:', error);
    throw error;
  }
}

/**
 * Creates a new intelligence item with validation
 * @param data - Intelligence creation data
 * @returns Promise with created intelligence item
 */
export async function createIntelligence(
  data: IntelligenceCreate
): Promise<Intelligence> {
  try {
    const response = await axios.post<IntelligenceResponse>(
      API_ENDPOINTS.INTELLIGENCE.CREATE.path,
      data
    );
    return response.data.data;
  } catch (error) {
    console.error('Failed to create intelligence:', error);
    throw error;
  }
}

/**
 * Updates an existing intelligence item
 * @param id - Intelligence item ID
 * @param data - Intelligence update data
 * @returns Promise with updated intelligence item
 */
export async function updateIntelligence(
  id: string,
  data: IntelligenceUpdate
): Promise<Intelligence> {
  try {
    const response = await axios.put<IntelligenceResponse>(
      `${API_ENDPOINTS.INTELLIGENCE.UPDATE.path}/${id}`,
      data
    );
    return response.data.data;
  } catch (error) {
    console.error('Failed to update intelligence:', error);
    throw error;
  }
}

/**
 * Processes an intelligence item with accuracy validation
 * @param id - Intelligence item ID
 * @param options - Processing options
 * @returns Promise with processed intelligence item
 */
export async function processIntelligence(
  id: string,
  options: Partial<ProcessingOptions> = {}
): Promise<Intelligence> {
  const processingOptions = { ...DEFAULT_PROCESSING_OPTIONS, ...options };
  const startTime = Date.now();

  try {
    const response = await axios.post<IntelligenceResponse>(
      `${API_ENDPOINTS.INTELLIGENCE.PROCESS.path}/${id}`,
      {
        options: processingOptions
      },
      {
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            console.debug(`Processing progress: ${progress.toFixed(2)}%`);
          }
        },
        timeout: processingOptions.processingTimeout
      }
    );

    const intelligence = response.data.data;
    const processingTime = Date.now() - startTime;

    // Validate processing results
    if (intelligence.processing_accuracy !== null && 
        intelligence.processing_accuracy < processingOptions.accuracyThreshold) {
      throw new Error(
        `Processing accuracy ${intelligence.processing_accuracy}% below threshold ${processingOptions.accuracyThreshold}%`
      );
    }

    if (processingTime > processingOptions.processingTimeout) {
      throw new Error(
        `Processing time ${processingTime}ms exceeded timeout ${processingOptions.processingTimeout}ms`
      );
    }

    return intelligence;
  } catch (error) {
    console.error('Intelligence processing failed:', error);
    throw error;
  }
}

/**
 * Retrieves processing status and metrics for an intelligence item
 * @param id - Intelligence item ID
 * @returns Promise with intelligence status
 */
export async function getIntelligenceStatus(id: string): Promise<Intelligence> {
  try {
    const response = await axios.get<IntelligenceResponse>(
      `${API_ENDPOINTS.INTELLIGENCE.STATUS.path}/${id}`
    );
    return response.data.data;
  } catch (error) {
    console.error('Failed to fetch intelligence status:', error);
    throw error;
  }
}

/**
 * Deletes an intelligence item
 * @param id - Intelligence item ID
 * @returns Promise indicating deletion success
 */
export async function deleteIntelligence(id: string): Promise<void> {
  try {
    await axios.delete(`${API_ENDPOINTS.INTELLIGENCE.DELETE.path}/${id}`);
  } catch (error) {
    console.error('Failed to delete intelligence:', error);
    throw error;
  }
}

/**
 * Validates intelligence processing results
 * @param intelligence - Intelligence item to validate
 * @param options - Processing options with thresholds
 * @returns Validation result with detailed metrics
 */
export function validateIntelligenceResults(
  intelligence: Intelligence,
  options: ProcessingOptions = DEFAULT_PROCESSING_OPTIONS
): { valid: boolean; metrics: Record<string, number> } {
  const metrics = {
    accuracy: intelligence.processing_accuracy ?? 0,
    processingTime: intelligence.processing_time ?? 0,
    validationScore: 0
  };

  // Calculate comprehensive validation score
  metrics.validationScore = metrics.accuracy * 0.7 + // Weight accuracy at 70%
    (1 - metrics.processingTime / options.processingTimeout) * 0.3; // Weight time at 30%

  return {
    valid: metrics.accuracy >= options.accuracyThreshold &&
           metrics.processingTime <= options.processingTimeout,
    metrics
  };
}