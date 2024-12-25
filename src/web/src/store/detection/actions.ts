/**
 * @fileoverview Redux action creators for detection state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - versions specified in package.json
import { createAsyncThunk } from '@reduxjs/toolkit'; // v1.9.0+
import axiosRetry from 'axios-retry'; // v3.8.0+

// Internal imports
import { 
  Detection,
  DetectionCreate,
  DetectionUpdate,
  DetectionFilters,
  ValidationResult,
  ErrorResponse
} from './types';
import {
  getDetections,
  createDetection,
  updateDetection,
  deleteDetection,
  validateDetection
} from '../../services/api/detection';
import { ERROR_CODES } from '../../config/constants';

// Performance monitoring thresholds (ms)
const PERFORMANCE_THRESHOLDS = {
  FETCH_DETECTIONS: 500,
  CREATE_DETECTION: 1000,
  UPDATE_DETECTION: 800,
  DELETE_DETECTION: 500,
  VALIDATE_DETECTION: 2000
};

/**
 * Async thunk for fetching detections with filtering and pagination
 * Implements performance monitoring and error handling
 */
export const fetchDetections = createAsyncThunk<
  Record<string, Detection>,
  { filters?: DetectionFilters; page?: number; limit?: number },
  { rejectValue: ErrorResponse }
>(
  'detection/fetchDetections',
  async (payload, { rejectWithValue }) => {
    const startTime = Date.now();

    try {
      const response = await getDetections({
        ...payload.filters,
        page: payload.page || 1,
        limit: payload.limit || 20
      });

      // Performance monitoring
      const duration = Date.now() - startTime;
      if (duration > PERFORMANCE_THRESHOLDS.FETCH_DETECTIONS) {
        console.warn('Detection fetch exceeded performance threshold', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.FETCH_DETECTIONS
        });
      }

      // Normalize response data
      const normalizedData: Record<string, Detection> = {};
      response.data.items.forEach(detection => {
        normalizedData[detection.id] = detection;
      });

      return normalizedData;
    } catch (error) {
      console.error('Failed to fetch detections:', error);
      return rejectWithValue({
        code: ERROR_CODES.DETECTION.INVALID_FORMAT.toString(),
        message: 'Failed to fetch detections',
        details: error
      });
    }
  }
);

/**
 * Async thunk for creating a new detection with validation
 * Implements performance monitoring and error handling
 */
export const createNewDetection = createAsyncThunk<
  Detection,
  DetectionCreate,
  { rejectValue: ErrorResponse }
>(
  'detection/createDetection',
  async (payload, { rejectWithValue }) => {
    const startTime = Date.now();

    try {
      // Validate required fields
      if (!payload.name || !payload.logic || !payload.platform) {
        throw new Error('Missing required detection fields');
      }

      const response = await createDetection(payload);

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
      return rejectWithValue({
        code: ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: 'Failed to create detection',
        details: error
      });
    }
  }
);

/**
 * Async thunk for updating an existing detection
 * Implements validation and performance monitoring
 */
export const updateExistingDetection = createAsyncThunk<
  Detection,
  { id: string; updates: DetectionUpdate },
  { rejectValue: ErrorResponse }
>(
  'detection/updateDetection',
  async (payload, { rejectWithValue }) => {
    const startTime = Date.now();

    try {
      const response = await updateDetection(payload.id, payload.updates);

      // Performance monitoring
      const duration = Date.now() - startTime;
      if (duration > PERFORMANCE_THRESHOLDS.UPDATE_DETECTION) {
        console.warn('Detection update exceeded performance threshold', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.UPDATE_DETECTION,
          detectionId: payload.id
        });
      }

      return response.data;
    } catch (error) {
      console.error('Failed to update detection:', error);
      return rejectWithValue({
        code: ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: `Failed to update detection with ID: ${payload.id}`,
        details: error
      });
    }
  }
);

/**
 * Async thunk for deleting a detection
 * Implements audit logging and error handling
 */
export const deleteExistingDetection = createAsyncThunk<
  string,
  string,
  { rejectValue: ErrorResponse }
>(
  'detection/deleteDetection',
  async (id, { rejectWithValue }) => {
    const startTime = Date.now();

    try {
      await deleteDetection(id);

      // Performance monitoring
      const duration = Date.now() - startTime;
      if (duration > PERFORMANCE_THRESHOLDS.DELETE_DETECTION) {
        console.warn('Detection deletion exceeded performance threshold', {
          duration,
          threshold: PERFORMANCE_THRESHOLDS.DELETE_DETECTION,
          detectionId: id
        });
      }

      return id;
    } catch (error) {
      console.error('Failed to delete detection:', error);
      return rejectWithValue({
        code: ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: `Failed to delete detection with ID: ${id}`,
        details: error
      });
    }
  }
);

/**
 * Async thunk for validating a detection
 * Implements performance monitoring and retry logic
 */
export const validateExistingDetection = createAsyncThunk<
  ValidationResult,
  string,
  { rejectValue: ErrorResponse }
>(
  'detection/validateDetection',
  async (id, { rejectWithValue }) => {
    const startTime = Date.now();

    try {
      const response = await validateDetection(id);

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
      return rejectWithValue({
        code: ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: `Failed to validate detection with ID: ${id}`,
        details: error
      });
    }
  }
);

// Configure retry strategy for detection operations
axiosRetry(undefined, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429;
  }
});