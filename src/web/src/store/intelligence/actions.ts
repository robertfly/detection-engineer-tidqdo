/**
 * @fileoverview Redux action creators for intelligence-related state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { Dispatch } from 'redux'; // v4.2.1
import { ThunkAction } from 'redux-thunk'; // v2.4.2
import * as Sentry from '@sentry/browser'; // v7.0.0

// Internal imports
import { IntelligenceActionTypes } from './types';
import { Intelligence } from '../../types/intelligence';
import { ApiResponse, PaginatedResponse, isApiErrorResponse } from '../../types/api';

// Types
import { RootState } from '../types';
import { IntelligenceError } from './types';

/**
 * Interface for fetch intelligence parameters
 */
interface FetchIntelligenceParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

/**
 * Interface for intelligence creation data
 */
interface CreateIntelligenceData {
  name: string;
  description: string;
  source_type: Intelligence['source_type'];
  source_url?: string;
  source_content?: string;
  metadata: Record<string, unknown>;
}

/**
 * Interface for status update metadata
 */
interface StatusMetadata {
  processing_accuracy?: number;
  validation_errors?: string[];
  processing_results?: Record<string, unknown>;
}

/**
 * Enhanced thunk action creator for fetching intelligence list
 * Implements pagination, filtering, and comprehensive error handling
 */
export const fetchIntelligence = (
  params: FetchIntelligenceParams
): ThunkAction<Promise<void>, RootState, unknown, any> => {
  return async (dispatch: Dispatch) => {
    try {
      // Validate pagination parameters
      if (params.page < 1 || params.pageSize < 1) {
        throw new Error('Invalid pagination parameters');
      }

      // Dispatch request action
      dispatch({
        type: IntelligenceActionTypes.FETCH_INTELLIGENCE_REQUEST,
        payload: { page: params.page, pageSize: params.pageSize }
      });

      // API call with error handling
      const response = await fetch('/api/v1/intelligence', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });

      const data: PaginatedResponse<Intelligence> = await response.json();

      if (isApiErrorResponse(data)) {
        throw new Error(data.errors[0]?.detail || 'Failed to fetch intelligence');
      }

      // Dispatch success with validated data
      dispatch({
        type: IntelligenceActionTypes.FETCH_INTELLIGENCE_SUCCESS,
        payload: {
          items: data.items,
          total: data.total
        }
      });
    } catch (error) {
      // Error logging and monitoring
      Sentry.captureException(error, {
        tags: {
          action: 'fetchIntelligence',
          page: params.page,
          pageSize: params.pageSize
        }
      });

      // Dispatch failure with error details
      dispatch({
        type: IntelligenceActionTypes.FETCH_INTELLIGENCE_FAILURE,
        payload: {
          code: 3001,
          message: error instanceof Error ? error.message : 'Failed to fetch intelligence'
        }
      });
    }
  };
};

/**
 * Enhanced thunk action creator for creating intelligence
 * Implements validation, file handling, and status tracking
 */
export const createIntelligence = (
  data: CreateIntelligenceData
): ThunkAction<Promise<string | null>, RootState, unknown, any> => {
  return async (dispatch: Dispatch) => {
    try {
      // Validate required fields
      if (!data.name || !data.source_type) {
        throw new Error('Missing required fields');
      }

      // Dispatch request action
      dispatch({
        type: IntelligenceActionTypes.CREATE_INTELLIGENCE_REQUEST,
        payload: {
          source_type: data.source_type,
          metadata: data.metadata
        }
      });

      // API call with error handling
      const response = await fetch('/api/v1/intelligence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result: ApiResponse<Intelligence> = await response.json();

      if (isApiErrorResponse(result)) {
        throw new Error(result.errors[0]?.detail || 'Failed to create intelligence');
      }

      // Dispatch success with created intelligence
      dispatch({
        type: IntelligenceActionTypes.CREATE_INTELLIGENCE_SUCCESS,
        payload: result.data
      });

      // Begin status polling if processing is required
      if (result.data.status === 'processing') {
        startStatusPolling(result.data.id, dispatch);
      }

      return result.data.id;
    } catch (error) {
      // Error logging and monitoring
      Sentry.captureException(error, {
        tags: {
          action: 'createIntelligence',
          source_type: data.source_type
        }
      });

      // Dispatch failure with error details
      dispatch({
        type: IntelligenceActionTypes.CREATE_INTELLIGENCE_FAILURE,
        payload: {
          code: 3002,
          message: error instanceof Error ? error.message : 'Failed to create intelligence'
        }
      });

      return null;
    }
  };
};

/**
 * Enhanced action creator for updating intelligence status
 * Implements status validation and metadata handling
 */
export const updateIntelligenceStatus = (
  id: string,
  status: Intelligence['status'],
  metadata?: StatusMetadata
) => {
  // Validate status transition
  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'validation_error'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status value');
  }

  return {
    type: IntelligenceActionTypes.UPDATE_INTELLIGENCE_STATUS,
    payload: {
      id,
      status,
      ...metadata
    }
  };
};

/**
 * Action creator for selecting intelligence
 */
export const selectIntelligence = (id: string) => ({
  type: IntelligenceActionTypes.SELECT_INTELLIGENCE,
  payload: id
});

/**
 * Helper function to poll intelligence processing status
 */
const startStatusPolling = async (
  id: string,
  dispatch: Dispatch,
  interval = 5000,
  maxAttempts = 60
) => {
  let attempts = 0;

  const pollStatus = async () => {
    try {
      const response = await fetch(`/api/v1/intelligence/${id}/status`);
      const result: ApiResponse<{ status: Intelligence['status'] }> = await response.json();

      if (isApiErrorResponse(result)) {
        throw new Error(result.errors[0]?.detail || 'Failed to fetch status');
      }

      dispatch(updateIntelligenceStatus(id, result.data.status));

      if (result.data.status === 'completed' || result.data.status === 'failed') {
        return;
      }

      if (++attempts < maxAttempts) {
        setTimeout(pollStatus, interval);
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          action: 'statusPolling',
          intelligence_id: id
        }
      });
    }
  };

  await pollStatus();
};