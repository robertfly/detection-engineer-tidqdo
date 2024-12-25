/**
 * @fileoverview Test suite for the detection API service module
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { faker } from '@faker-js/faker';
import type { MockedFunction } from 'jest-mock';

// Internal imports
import {
  getDetections,
  getDetection,
  createDetection,
  updateDetection,
  deleteDetection,
  validateDetection
} from '../../../../src/services/api/detection';
import type {
  Detection,
  DetectionCreate,
  DetectionUpdate,
  DetectionError
} from '../../../../src/types/detection';
import { get, post, put, del, ApiError, RateLimitError } from '../../../../src/utils/api';

// Mock API utilities
jest.mock('../../../../src/utils/api');

// Type assertions for mocked functions
const mockedGet = get as MockedFunction<typeof get>;
const mockedPost = post as MockedFunction<typeof post>;
const mockedPut = put as MockedFunction<typeof put>;
const mockedDelete = del as MockedFunction<typeof del>;

describe('Detection API Service', () => {
  // Test data setup
  const mockDetection: Detection = {
    id: faker.string.uuid(),
    name: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    metadata: {
      author: faker.internet.userName(),
      tags: faker.helpers.arrayElements(['windows', 'linux', 'network'], 2)
    },
    logic: {
      query: 'process_name = "malware.exe"',
      platform: 'sigma'
    },
    mitre_mapping: {
      'T1055': ['T1055.001', 'T1055.002']
    },
    status: 'active',
    platform: 'sigma',
    creator_id: faker.string.uuid(),
    library_id: faker.string.uuid(),
    validation_results: {},
    test_results: {},
    performance_metrics: {
      avgExecutionTime: 150
    },
    last_validated: faker.date.recent().toISOString(),
    version: '1.0.0',
    previous_versions: [],
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString()
  };

  const mockDetectionCreate: DetectionCreate = {
    name: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    metadata: {
      author: faker.internet.userName(),
      tags: faker.helpers.arrayElements(['windows', 'linux', 'network'], 2)
    },
    logic: {
      query: 'process_name = "suspicious.exe"',
      platform: 'sigma'
    },
    mitre_mapping: {
      'T1055': ['T1055.001']
    },
    platform: 'sigma',
    library_id: faker.string.uuid(),
    tags: ['windows', 'process_creation'],
    severity: 'high'
  };

  const mockDetectionUpdate: DetectionUpdate = {
    name: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    metadata: {
      updated_by: faker.internet.userName()
    },
    logic: {
      query: 'process_name = "updated.exe"'
    },
    mitre_mapping: {
      'T1055': ['T1055.003']
    },
    status: 'active',
    tags: ['windows', 'updated'],
    severity: 'critical'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CRUD Operations', () => {
    test('getDetections should fetch paginated detections with filters', async () => {
      const mockResponse = {
        items: [mockDetection],
        total: 1,
        page: 1,
        limit: 10,
        pages: 1
      };

      mockedGet.mockResolvedValueOnce({ data: mockResponse, status: 'success' });

      const params = {
        page: 1,
        limit: 10,
        platform: 'sigma',
        status: 'active'
      };

      const result = await getDetections(params);

      expect(mockedGet).toHaveBeenCalledWith('/detections', { params });
      expect(result).toEqual(mockResponse);
    });

    test('getDetection should fetch single detection by ID', async () => {
      mockedGet.mockResolvedValueOnce({ data: mockDetection, status: 'success' });

      const result = await getDetection(mockDetection.id);

      expect(mockedGet).toHaveBeenCalledWith(`/detections/${mockDetection.id}`);
      expect(result).toEqual(mockDetection);
    });

    test('createDetection should create new detection with validation', async () => {
      mockedPost.mockResolvedValueOnce({ data: mockDetection, status: 'success' });

      const result = await createDetection(mockDetectionCreate);

      expect(mockedPost).toHaveBeenCalledWith('/detections', mockDetectionCreate);
      expect(result).toEqual(mockDetection);
    });

    test('updateDetection should update existing detection', async () => {
      const updatedDetection = { ...mockDetection, ...mockDetectionUpdate };
      mockedPut.mockResolvedValueOnce({ data: updatedDetection, status: 'success' });

      const result = await updateDetection(mockDetection.id, mockDetectionUpdate);

      expect(mockedPut).toHaveBeenCalledWith(
        `/detections/${mockDetection.id}`,
        mockDetectionUpdate
      );
      expect(result).toEqual(updatedDetection);
    });

    test('deleteDetection should remove detection', async () => {
      mockedDelete.mockResolvedValueOnce({ data: null, status: 'success' });

      await deleteDetection(mockDetection.id);

      expect(mockedDelete).toHaveBeenCalledWith(`/detections/${mockDetection.id}`);
    });
  });

  describe('Security Controls', () => {
    test('should handle rate limit errors', async () => {
      const rateLimitError = new RateLimitError('Rate limit exceeded');
      mockedGet.mockRejectedValueOnce(rateLimitError);

      await expect(getDetections()).rejects.toThrow(RateLimitError);
    });

    test('should handle unauthorized access', async () => {
      const authError = new ApiError({
        code: '1003',
        title: 'Unauthorized',
        detail: 'Invalid or expired token'
      });
      mockedGet.mockRejectedValueOnce(authError);

      await expect(getDetections()).rejects.toThrow(ApiError);
    });

    test('should validate required fields on creation', async () => {
      const invalidDetection = { ...mockDetectionCreate };
      delete invalidDetection.name;

      await expect(createDetection(invalidDetection as DetectionCreate))
        .rejects
        .toThrow('Missing required detection fields');
    });
  });

  describe('Performance Metrics', () => {
    test('should track response times', async () => {
      const startTime = Date.now();
      mockedGet.mockResolvedValueOnce({ data: mockDetection, status: 'success' });

      await getDetection(mockDetection.id);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(200); // API_TIMEOUT threshold
    });

    test('should handle timeouts gracefully', async () => {
      const timeoutError = new ApiError({
        code: '5003',
        title: 'Request Timeout',
        detail: 'Request exceeded timeout threshold'
      });
      mockedGet.mockRejectedValueOnce(timeoutError);

      await expect(getDetection(mockDetection.id)).rejects.toThrow(ApiError);
    });
  });

  describe('Validation', () => {
    test('validateDetection should perform comprehensive validation', async () => {
      const validationResponse = {
        valid: true,
        errors: [],
        warnings: [],
        performance: {
          executionTime: 150,
          resourceUsage: 'low'
        }
      };

      mockedPost.mockResolvedValueOnce({ data: validationResponse, status: 'success' });

      const result = await validateDetection(mockDetection.id);

      expect(mockedPost).toHaveBeenCalledWith(`/validate/${mockDetection.id}`);
      expect(result).toEqual(validationResponse);
    });

    test('should handle validation failures', async () => {
      const validationError: DetectionError = {
        code: '2002',
        title: 'Validation Failed',
        detail: 'Invalid detection logic syntax'
      };
      mockedPost.mockRejectedValueOnce(validationError);

      await expect(validateDetection(mockDetection.id)).rejects.toThrow();
    });
  });
});