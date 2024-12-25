/**
 * @fileoverview Redux reducer for detection state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { 
  createSlice, 
  PayloadAction, 
  createEntityAdapter,
  EntityState
} from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { 
  Detection, 
  DetectionState, 
  DetectionFilters, 
  ErrorState, 
  LoadingState,
  PaginationState
} from './types';
import {
  fetchDetections,
  createNewDetection,
  updateExistingDetection,
  deleteExistingDetection,
  validateExistingDetection
} from './actions';
import { ERROR_CODES } from '../../config/constants';

/**
 * Entity adapter for normalized detection state management
 * Implements efficient CRUD operations with memoized selectors
 */
const detectionAdapter = createEntityAdapter<Detection>({
  selectId: (detection) => detection.id,
  sortComparer: (a, b) => b.updated_at.localeCompare(a.updated_at)
});

/**
 * Initial state with comprehensive type safety
 */
const initialState: DetectionState = {
  ...detectionAdapter.getInitialState(),
  selectedId: null,
  loading: {
    fetch: false,
    create: false,
    update: false,
    delete: false
  },
  error: {
    code: null,
    message: null,
    details: null
  },
  filters: {
    status: [],
    platform: [],
    library_id: null,
    search: '',
    mitreTactics: [],
    mitreTechniques: [],
    tags: [],
    author: null
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0
  }
};

/**
 * Detection slice with enhanced error handling and performance optimization
 */
const detectionSlice = createSlice({
  name: 'detection',
  initialState,
  reducers: {
    /**
     * Sets the currently selected detection
     */
    setSelectedDetection: (state, action: PayloadAction<string | null>) => {
      state.selectedId = action.payload;
    },

    /**
     * Updates detection filters with partial updates
     */
    setDetectionFilters: (state, action: PayloadAction<Partial<DetectionFilters>>) => {
      state.filters = {
        ...state.filters,
        ...action.payload
      };
      // Reset pagination when filters change
      state.pagination.page = 1;
    },

    /**
     * Updates pagination settings
     */
    setPagination: (state, action: PayloadAction<Partial<PaginationState>>) => {
      state.pagination = {
        ...state.pagination,
        ...action.payload
      };
    },

    /**
     * Clears error state
     */
    clearError: (state) => {
      state.error = {
        code: null,
        message: null,
        details: null
      };
    },

    /**
     * Sets loading state for specific operations
     */
    setLoading: (state, action: PayloadAction<{ type: keyof LoadingState; loading: boolean }>) => {
      state.loading[action.payload.type] = action.payload.loading;
    }
  },
  extraReducers: (builder) => {
    // Fetch detections handlers
    builder.addCase(fetchDetections.pending, (state) => {
      state.loading.fetch = true;
      state.error = initialState.error;
    });
    builder.addCase(fetchDetections.fulfilled, (state, action) => {
      state.loading.fetch = false;
      detectionAdapter.setAll(state, action.payload);
      state.pagination.total = Object.keys(action.payload).length;
    });
    builder.addCase(fetchDetections.rejected, (state, action) => {
      state.loading.fetch = false;
      state.error = {
        code: action.payload?.code || ERROR_CODES.DETECTION.INVALID_FORMAT.toString(),
        message: action.payload?.message || 'Failed to fetch detections',
        details: action.payload?.details || null
      };
    });

    // Create detection handlers
    builder.addCase(createNewDetection.pending, (state) => {
      state.loading.create = true;
      state.error = initialState.error;
    });
    builder.addCase(createNewDetection.fulfilled, (state, action) => {
      state.loading.create = false;
      detectionAdapter.addOne(state, action.payload);
    });
    builder.addCase(createNewDetection.rejected, (state, action) => {
      state.loading.create = false;
      state.error = {
        code: action.payload?.code || ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: action.payload?.message || 'Failed to create detection',
        details: action.payload?.details || null
      };
    });

    // Update detection handlers
    builder.addCase(updateExistingDetection.pending, (state) => {
      state.loading.update = true;
      state.error = initialState.error;
    });
    builder.addCase(updateExistingDetection.fulfilled, (state, action) => {
      state.loading.update = false;
      detectionAdapter.updateOne(state, {
        id: action.payload.id,
        changes: action.payload
      });
    });
    builder.addCase(updateExistingDetection.rejected, (state, action) => {
      state.loading.update = false;
      state.error = {
        code: action.payload?.code || ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: action.payload?.message || 'Failed to update detection',
        details: action.payload?.details || null
      };
    });

    // Delete detection handlers
    builder.addCase(deleteExistingDetection.pending, (state) => {
      state.loading.delete = true;
      state.error = initialState.error;
    });
    builder.addCase(deleteExistingDetection.fulfilled, (state, action) => {
      state.loading.delete = false;
      detectionAdapter.removeOne(state, action.payload);
      if (state.selectedId === action.payload) {
        state.selectedId = null;
      }
    });
    builder.addCase(deleteExistingDetection.rejected, (state, action) => {
      state.loading.delete = false;
      state.error = {
        code: action.payload?.code || ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: action.payload?.message || 'Failed to delete detection',
        details: action.payload?.details || null
      };
    });

    // Validate detection handlers
    builder.addCase(validateExistingDetection.pending, (state) => {
      state.loading.update = true;
      state.error = initialState.error;
    });
    builder.addCase(validateExistingDetection.fulfilled, (state, action) => {
      state.loading.update = false;
      if (state.selectedId) {
        detectionAdapter.updateOne(state, {
          id: state.selectedId,
          changes: {
            validation_results: action.payload,
            last_validated: new Date().toISOString()
          }
        });
      }
    });
    builder.addCase(validateExistingDetection.rejected, (state, action) => {
      state.loading.update = false;
      state.error = {
        code: action.payload?.code || ERROR_CODES.DETECTION.VALIDATION_FAILED.toString(),
        message: action.payload?.message || 'Failed to validate detection',
        details: action.payload?.details || null
      };
    });
  }
});

// Export actions
export const { 
  setSelectedDetection, 
  setDetectionFilters, 
  setPagination, 
  clearError, 
  setLoading 
} = detectionSlice.actions;

// Export selectors
export const {
  selectAll: selectAllDetections,
  selectById: selectDetectionById,
  selectIds: selectDetectionIds,
  selectTotal: selectTotalDetections
} = detectionAdapter.getSelectors();

// Export reducer
export default detectionSlice.reducer;