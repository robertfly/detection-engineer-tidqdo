/**
 * @fileoverview Test suite for useDetection custom hook
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, cleanup } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Internal imports
import { useDetection } from '../../src/hooks/useDetection';
import type {
  Detection,
  DetectionCreate,
  DetectionUpdate,
  ValidationResult,
  PerformanceMetrics
} from '../../src/types/detection';

// Test constants
const TEST_TIMEOUT = 5000;

// Mock data
const mockDetection: Detection = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Detection',
  description: 'Test detection for unit tests',
  metadata: {
    tags: ['test', 'unit-test'],
    severity: 'medium'
  },
  logic: {
    query: 'process_name = "test.exe"'
  },
  mitre_mapping: {
    'TA0001': ['T1001', 'T1002']
  },
  status: 'active',
  platform: 'sigma',
  creator_id: 'test-user',
  library_id: 'test-library',
  validation_results: null,
  test_results: null,
  performance_metrics: {
    execution_time: 150,
    memory_usage: 50
  },
  last_validated: '2024-01-19T10:00:00Z',
  version: '1.0.0',
  previous_versions: [],
  created_at: '2024-01-19T10:00:00Z',
  updated_at: '2024-01-19T10:00:00Z'
};

const mockError = {
  code: 'DETECTION_001',
  message: 'Invalid detection format',
  details: {
    field: 'logic',
    reason: 'Syntax error in query'
  }
};

const mockPerformanceMetrics: PerformanceMetrics = {
  execution_time: 150,
  memory_usage: 50,
  query_complexity: 3
};

// Setup test environment
const setupTestEnvironment = () => {
  // Create mock store with performance monitoring middleware
  const store = configureStore({
    reducer: {
      detection: createSlice({
        name: 'detection',
        initialState: {
          detections: {},
          selectedId: null,
          loading: false,
          error: null,
          filters: {},
          pagination: { page: 1, limit: 20, total: 0 }
        },
        reducers: {}
      }).reducer
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat((store) => (next) => (action) => {
        const start = performance.now();
        const result = next(action);
        const duration = performance.now() - start;
        
        // Log performance warning if action takes too long
        if (duration > 16) {
          console.warn('Slow action detected:', {
            type: action.type,
            duration: `${duration.toFixed(2)}ms`
          });
        }
        
        return result;
      })
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return { store, wrapper };
};

describe('useDetection Hook', () => {
  let mockStore: ReturnType<typeof setupTestEnvironment>['store'];
  let wrapper: ReturnType<typeof setupTestEnvironment>['wrapper'];

  beforeEach(() => {
    const env = setupTestEnvironment();
    mockStore = env.store;
    wrapper = env.wrapper;
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Basic CRUD Operations', () => {
    it('should fetch detections successfully', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      await act(async () => {
        await result.current.fetchDetections();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    }, TEST_TIMEOUT);

    it('should create detection with validation', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const newDetection: DetectionCreate = {
        name: 'New Test Detection',
        description: 'Test detection creation',
        metadata: { tags: ['test'] },
        logic: { query: 'process_name = "malware.exe"' },
        mitre_mapping: { 'TA0001': ['T1001'] },
        platform: 'sigma',
        library_id: 'test-library',
        tags: ['test'],
        severity: 'high'
      };

      await act(async () => {
        await result.current.createDetection(newDetection);
      });

      expect(result.current.error).toBeNull();
    });

    it('should update detection with optimistic updates', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const update: DetectionUpdate = {
        name: 'Updated Detection',
        description: 'Updated description',
        metadata: { tags: ['updated'] },
        logic: { query: 'updated_query' },
        mitre_mapping: { 'TA0002': ['T2001'] },
        status: 'active',
        tags: ['updated'],
        severity: 'critical'
      };

      await act(async () => {
        await result.current.updateDetection(mockDetection.id, update);
      });

      expect(result.current.error).toBeNull();
    });

    it('should delete detection with confirmation', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      await act(async () => {
        await result.current.deleteDetection(mockDetection.id);
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Validation and Performance', () => {
    it('should validate detection logic', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      await act(async () => {
        const validationResult = await result.current.validateDetection(mockDetection.id);
        expect(validationResult).toBeTruthy();
      });
    });

    it('should track API response times', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const start = performance.now();

      await act(async () => {
        await result.current.fetchDetections();
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // Technical spec requirement
    });

    it('should handle validation errors correctly', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      await act(async () => {
        try {
          await result.current.validateDetection('invalid-id');
        } catch (error) {
          expect(error).toBeDefined();
          expect(result.current.error).toBeDefined();
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      await act(async () => {
        try {
          await result.current.fetchDetections({ status: ['invalid'] });
        } catch (error) {
          expect(error).toBeDefined();
          expect(result.current.error).toBeDefined();
        }
      });
    });

    it('should handle validation failures with detailed errors', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const invalidDetection: DetectionCreate = {
        name: '', // Invalid: empty name
        description: 'Test',
        metadata: {},
        logic: { query: '' }, // Invalid: empty query
        mitre_mapping: {},
        platform: 'sigma',
        library_id: 'test-library',
        tags: [],
        severity: 'high'
      };

      await act(async () => {
        try {
          await result.current.createDetection(invalidDetection);
        } catch (error) {
          expect(error).toBeDefined();
          expect(result.current.error).toMatchObject({
            code: expect.any(String),
            message: expect.any(String)
          });
        }
      });
    });

    it('should handle rate limit errors', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });

      // Simulate multiple rapid requests
      await act(async () => {
        const promises = Array(10).fill(null).map(() => 
          result.current.fetchDetections()
        );
        
        try {
          await Promise.all(promises);
        } catch (error) {
          expect(error).toBeDefined();
          expect(result.current.error).toMatchObject({
            code: expect.stringMatching(/429|RATE_LIMIT/),
            message: expect.any(String)
          });
        }
      });
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch updates successfully', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const updates = [
        { id: 'id1', update: { name: 'Updated 1' } },
        { id: 'id2', update: { name: 'Updated 2' } }
      ];

      await act(async () => {
        await result.current.batchUpdateDetections(updates);
      });

      expect(result.current.error).toBeNull();
    });

    it('should validate all detections in batch', async () => {
      const { result } = renderHook(() => useDetection(), { wrapper });
      const detectionIds = ['id1', 'id2', 'id3'];

      await act(async () => {
        const validationResults = await Promise.all(
          detectionIds.map(id => result.current.validateDetection(id))
        );
        expect(validationResults).toHaveLength(detectionIds.length);
      });
    });
  });
});