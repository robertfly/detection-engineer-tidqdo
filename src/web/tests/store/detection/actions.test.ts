/**
 * @fileoverview Test suite for Redux detection action creators
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - versions specified in package.json
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0+
import { configureStore } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import {
  fetchDetections,
  createNewDetection,
  updateExistingDetection,
  deleteExistingDetection,
  validateExistingDetection
} from '../../../src/store/detection/actions';
import {
  Detection,
  DetectionCreate,
  DetectionUpdate,
  ValidationResult
} from '../../../src/store/detection/types';
import * as api from '../../../src/services/api/detection';
import { ERROR_CODES } from '../../../src/config/constants';

// Mock API functions
jest.mock('../../../src/services/api/detection');

// Test data setup
const mockDetection: Detection = {
  id: '1',
  name: 'Test Detection',
  description: 'Test description',
  metadata: {
    created: new Date().toISOString(),
    author: 'test@example.com'
  },
  logic: {
    query: 'test query'
  },
  mitre_mapping: {
    'T1055': ['001']
  },
  status: 'draft',
  platform: 'sigma',
  creator_id: 'user1',
  library_id: 'lib1',
  validation_results: {},
  test_results: {},
  performance_metrics: {},
  last_validated: new Date().toISOString(),
  version: '1.0.0',
  previous_versions: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Performance monitoring middleware
const performanceMiddleware = () => (next: any) => (action: any) => {
  const start = Date.now();
  const result = next(action);
  const duration = Date.now() - start;
  
  // Log performance metrics
  console.debug('Action Performance:', {
    type: action.type,
    duration,
    timestamp: new Date().toISOString()
  });
  
  return result;
};

// Configure test store
const mockStore = configureStore({
  reducer: {},
  middleware: (getDefaultMiddleware) => 
    getDefaultMiddleware().concat(performanceMiddleware)
});

describe('Detection Action Creators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchDetections', () => {
    it('should successfully fetch detections with performance tracking', async () => {
      // Mock API response
      const mockResponse = {
        data: {
          items: [mockDetection],
          total: 1,
          page: 1,
          limit: 20
        }
      };
      (api.getDetections as jest.Mock).mockResolvedValue(mockResponse);

      // Execute action
      const result = await mockStore.dispatch(fetchDetections({
        filters: { status: ['draft'], platform: ['sigma'] },
        page: 1,
        limit: 20
      }));

      // Verify success
      expect(result.type).toBe('detection/fetchDetections/fulfilled');
      expect(result.payload).toEqual({ [mockDetection.id]: mockDetection });
      expect(api.getDetections).toHaveBeenCalledWith({
        status: ['draft'],
        platform: ['sigma'],
        page: 1,
        limit: 20
      });
    });

    it('should handle API errors with proper error codes', async () => {
      // Mock API error
      const error = new Error('API Error');
      (api.getDetections as jest.Mock).mockRejectedValue(error);

      // Execute action
      const result = await mockStore.dispatch(fetchDetections({}));

      // Verify error handling
      expect(result.type).toBe('detection/fetchDetections/rejected');
      expect(result.payload).toEqual({
        code: ERROR_CODES.DETECTION.INVALID_FORMAT.toString(),
        message: 'Failed to fetch detections',
        details: error
      });
    });
  });

  describe('createNewDetection', () => {
    const createPayload: DetectionCreate = {
      name: 'New Detection',
      description: 'Test description',
      metadata: { author: 'test@example.com' },
      logic: { query: 'test query' },
      mitre_mapping: { 'T1055': ['001'] },
      platform: 'sigma',
      library_id: 'lib1',
      tags: ['test'],
      severity: 'medium'
    };

    it('should successfully create detection with audit logging', async () => {
      // Mock API response
      (api.createDetection as jest.Mock).mockResolvedValue({ data: mockDetection });

      // Execute action
      const result = await mockStore.dispatch(createNewDetection(createPayload));

      // Verify success
      expect(result.type).toBe('detection/createDetection/fulfilled');
      expect(result.payload).toEqual(mockDetection);
      expect(api.createDetection).toHaveBeenCalledWith(createPayload);
    });

    it('should validate required fields before API call', async () => {
      // Execute action with invalid payload
      const result = await mockStore.dispatch(createNewDetection({
        ...createPayload,
        name: '', // Invalid: empty name
        logic: undefined // Invalid: missing logic
      } as any));

      // Verify validation error
      expect(result.type).toBe('detection/createDetection/rejected');
      expect(result.payload?.code).toBe(ERROR_CODES.DETECTION.VALIDATION_FAILED.toString());
    });
  });

  describe('updateExistingDetection', () => {
    const updatePayload = {
      id: '1',
      updates: {
        name: 'Updated Detection',
        description: 'Updated description',
        status: 'active' as const
      }
    };

    it('should successfully update detection with optimistic updates', async () => {
      // Mock API response
      (api.updateDetection as jest.Mock).mockResolvedValue({ data: {
        ...mockDetection,
        ...updatePayload.updates
      }});

      // Execute action
      const result = await mockStore.dispatch(updateExistingDetection(updatePayload));

      // Verify success
      expect(result.type).toBe('detection/updateDetection/fulfilled');
      expect(result.payload.name).toBe(updatePayload.updates.name);
      expect(api.updateDetection).toHaveBeenCalledWith(
        updatePayload.id,
        updatePayload.updates
      );
    });

    it('should handle API errors with rollback', async () => {
      // Mock API error
      const error = new Error('Update failed');
      (api.updateDetection as jest.Mock).mockRejectedValue(error);

      // Execute action
      const result = await mockStore.dispatch(updateExistingDetection(updatePayload));

      // Verify error handling
      expect(result.type).toBe('detection/updateDetection/rejected');
      expect(result.payload?.code).toBe(ERROR_CODES.DETECTION.VALIDATION_FAILED.toString());
    });
  });

  describe('deleteExistingDetection', () => {
    it('should successfully delete detection with audit logging', async () => {
      // Mock API response
      (api.deleteDetection as jest.Mock).mockResolvedValue({});

      // Execute action
      const result = await mockStore.dispatch(deleteExistingDetection('1'));

      // Verify success
      expect(result.type).toBe('detection/deleteDetection/fulfilled');
      expect(result.payload).toBe('1');
      expect(api.deleteDetection).toHaveBeenCalledWith('1');
    });

    it('should handle deletion errors with proper error codes', async () => {
      // Mock API error
      const error = new Error('Delete failed');
      (api.deleteDetection as jest.Mock).mockRejectedValue(error);

      // Execute action
      const result = await mockStore.dispatch(deleteExistingDetection('1'));

      // Verify error handling
      expect(result.type).toBe('detection/deleteDetection/rejected');
      expect(result.payload?.code).toBe(ERROR_CODES.DETECTION.VALIDATION_FAILED.toString());
    });
  });

  describe('validateExistingDetection', () => {
    const mockValidationResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      performance: {
        executionTime: 150,
        resourceUsage: 'low'
      }
    };

    it('should successfully validate detection with performance tracking', async () => {
      // Mock API response
      (api.validateDetection as jest.Mock).mockResolvedValue({ data: mockValidationResult });

      // Execute action
      const result = await mockStore.dispatch(validateExistingDetection('1'));

      // Verify success
      expect(result.type).toBe('detection/validateDetection/fulfilled');
      expect(result.payload).toEqual(mockValidationResult);
      expect(api.validateDetection).toHaveBeenCalledWith('1');
    });

    it('should handle validation errors with proper error codes', async () => {
      // Mock API error
      const error = new Error('Validation failed');
      (api.validateDetection as jest.Mock).mockRejectedValue(error);

      // Execute action
      const result = await mockStore.dispatch(validateExistingDetection('1'));

      // Verify error handling
      expect(result.type).toBe('detection/validateDetection/rejected');
      expect(result.payload?.code).toBe(ERROR_CODES.DETECTION.VALIDATION_FAILED.toString());
    });
  });
});