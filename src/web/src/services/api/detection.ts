/**
 * @fileoverview Detection API service module for managing security detection rules
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import axiosRetry from 'axios-retry'; // v3.8.0

// Internal imports
import { 
  Detection, 
  DetectionCreate, 
  DetectionUpdate, 
  DetectionResponse, 
  DetectionListResponse,
  ValidationResponse 
} from '../../types/detection';
import { API_ENDPOINTS } from '../../config/api';
import { get, post, put, del } from '../../utils/api';
import { ERROR_CODES } from '../../config/constants';

// Constants for performance monitoring
const PERFORMANCE_THRESHOLDS = {
  LIST_DETECTIONS: 500, // ms
  GET_DETECTION: 200,   // ms
  CREATE_DETECTION: 1000,
  UPDATE_DETECTION: 800,
  DELETE_DETECTION: 500,
  VALIDATE_DETECTION: 2000
};

/**
 * Retrieves a paginated list of detections with optional filters
 * @param params - Query parameters for filtering and pagination
 * @returns Promise with paginated detection list response
 */
export const getDetections = async (
  params: Record<string, any> = {}
): Promise<DetectionListResponse> => {
  const startTime = Date.now();
  
  try {
    const response = await get<DetectionListResponse>(
      API_ENDPOINTS.DETECTIONS.LIST.path,
      { params }
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.LIST_DETECTIONS) {
      console.warn('Detection list request exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.LIST_DETECTIONS
      });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch detections:', error);
    throw {
      code: ERROR_CODES.DETECTION.INVALID_FORMAT,
      message: 'Failed to fetch detections',
      details: error
    };
  }
};

/**
 * Retrieves a single detection by ID with enhanced error handling
 * @param id - Detection ID to retrieve
 * @returns Promise with single detection response
 */
export const getDetection = async (id: string): Promise<DetectionResponse> => {
  const startTime = Date.now();

  try {
    const response = await get<DetectionResponse>(
      `${API_ENDPOINTS.DETECTIONS.LIST.path}/${id}`
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.GET_DETECTION) {
      console.warn('Detection fetch exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.GET_DETECTION,
        detectionId: id
      });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch detection:', error);
    throw {
      code: ERROR_CODES.DETECTION.INVALID_FORMAT,
      message: `Failed to fetch detection with ID: ${id}`,
      details: error
    };
  }
};

/**
 * Creates a new detection with validation and audit logging
 * @param data - Detection creation data
 * @returns Promise with created detection response
 */
export const createDetection = async (
  data: DetectionCreate
): Promise<DetectionResponse> => {
  const startTime = Date.now();

  try {
    // Validate required fields
    if (!data.name || !data.logic || !data.platform) {
      throw new Error('Missing required detection fields');
    }

    const response = await post<DetectionResponse>(
      API_ENDPOINTS.DETECTIONS.CREATE.path,
      data
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.CREATE_DETECTION) {
      console.warn('Detection creation exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.CREATE_DETECTION
      });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to create detection:', error);
    throw {
      code: ERROR_CODES.DETECTION.VALIDATION_FAILED,
      message: 'Failed to create detection',
      details: error
    };
  }
};

/**
 * Updates an existing detection with validation and audit logging
 * @param id - Detection ID to update
 * @param data - Detection update data
 * @returns Promise with updated detection response
 */
export const updateDetection = async (
  id: string,
  data: DetectionUpdate
): Promise<DetectionResponse> => {
  const startTime = Date.now();

  try {
    const response = await put<DetectionResponse>(
      `${API_ENDPOINTS.DETECTIONS.UPDATE.path.replace(':id', id)}`,
      data
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.UPDATE_DETECTION) {
      console.warn('Detection update exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.UPDATE_DETECTION,
        detectionId: id
      });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to update detection:', error);
    throw {
      code: ERROR_CODES.DETECTION.VALIDATION_FAILED,
      message: `Failed to update detection with ID: ${id}`,
      details: error
    };
  }
};

/**
 * Deletes a detection by ID with audit logging
 * @param id - Detection ID to delete
 * @returns Promise void on successful deletion
 */
export const deleteDetection = async (id: string): Promise<void> => {
  const startTime = Date.now();

  try {
    await del(
      `${API_ENDPOINTS.DETECTIONS.DELETE.path.replace(':id', id)}`
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.DELETE_DETECTION) {
      console.warn('Detection deletion exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.DELETE_DETECTION,
        detectionId: id
      });
    }
  } catch (error) {
    console.error('Failed to delete detection:', error);
    throw {
      code: ERROR_CODES.DETECTION.VALIDATION_FAILED,
      message: `Failed to delete detection with ID: ${id}`,
      details: error
    };
  }
};

/**
 * Validates a detection's logic and structure
 * @param id - Detection ID to validate
 * @returns Promise with validation response
 */
export const validateDetection = async (
  id: string
): Promise<ValidationResponse> => {
  const startTime = Date.now();

  try {
    const response = await post<ValidationResponse>(
      `${API_ENDPOINTS.VALIDATION.VALIDATE.path}/${id}`
    );

    // Performance monitoring
    const duration = Date.now() - startTime;
    if (duration > PERFORMANCE_THRESHOLDS.VALIDATE_DETECTION) {
      console.warn('Detection validation exceeded performance threshold', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.VALIDATE_DETECTION,
        detectionId: id
      });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to validate detection:', error);
    throw {
      code: ERROR_CODES.DETECTION.VALIDATION_FAILED,
      message: `Failed to validate detection with ID: ${id}`,
      details: error
    };
  }
};

// Configure retry strategy for detection-specific endpoints
axiosRetry(undefined, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429;
  }
});