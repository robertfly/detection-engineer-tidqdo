/**
 * @fileoverview Redux type definitions for intelligence state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - redux@4.2.1
import { Action } from 'redux';

// Internal imports
import { Intelligence } from '../../types/intelligence';

/**
 * Enumeration of all intelligence-related Redux action types
 * Follows a domain-driven naming convention for clarity and maintainability
 */
export enum IntelligenceActionTypes {
  FETCH_INTELLIGENCE_REQUEST = 'intelligence/FETCH_REQUEST',
  FETCH_INTELLIGENCE_SUCCESS = 'intelligence/FETCH_SUCCESS',
  FETCH_INTELLIGENCE_FAILURE = 'intelligence/FETCH_FAILURE',
  CREATE_INTELLIGENCE_REQUEST = 'intelligence/CREATE_REQUEST',
  CREATE_INTELLIGENCE_SUCCESS = 'intelligence/CREATE_SUCCESS',
  CREATE_INTELLIGENCE_FAILURE = 'intelligence/CREATE_FAILURE',
  UPDATE_INTELLIGENCE_STATUS = 'intelligence/UPDATE_STATUS',
  SELECT_INTELLIGENCE = 'intelligence/SELECT',
  CLEAR_INTELLIGENCE_ERROR = 'intelligence/CLEAR_ERROR'
}

/**
 * Interface for intelligence-related errors
 * Maps to error codes in range 3000-3999 as per technical specification
 */
export interface IntelligenceError {
  code: number;
  message: string;
}

/**
 * Interface defining the shape of the intelligence Redux state
 * Includes support for pagination, selection, and error handling
 */
export interface IntelligenceState {
  items: Intelligence[];
  selectedId: string | null;
  loading: boolean;
  error: IntelligenceError | null;
  total: number;
  pageSize: number;
  currentPage: number;
}

/**
 * Action interfaces for fetching intelligence with pagination
 */
export interface FetchIntelligenceRequestAction extends Action {
  type: IntelligenceActionTypes.FETCH_INTELLIGENCE_REQUEST;
  payload: {
    page: number;
    pageSize: number;
  };
}

export interface FetchIntelligenceSuccessAction extends Action {
  type: IntelligenceActionTypes.FETCH_INTELLIGENCE_SUCCESS;
  payload: {
    items: Intelligence[];
    total: number;
  };
}

export interface FetchIntelligenceFailureAction extends Action {
  type: IntelligenceActionTypes.FETCH_INTELLIGENCE_FAILURE;
  payload: IntelligenceError;
}

/**
 * Action interfaces for creating new intelligence items
 */
export interface CreateIntelligenceRequestAction extends Action {
  type: IntelligenceActionTypes.CREATE_INTELLIGENCE_REQUEST;
  payload: {
    source_type: Intelligence['source_type'];
    metadata: Intelligence['metadata'];
  };
}

export interface CreateIntelligenceSuccessAction extends Action {
  type: IntelligenceActionTypes.CREATE_INTELLIGENCE_SUCCESS;
  payload: Intelligence;
}

export interface CreateIntelligenceFailureAction extends Action {
  type: IntelligenceActionTypes.CREATE_INTELLIGENCE_FAILURE;
  payload: IntelligenceError;
}

/**
 * Action interface for updating intelligence processing status
 */
export interface UpdateIntelligenceStatusAction extends Action {
  type: IntelligenceActionTypes.UPDATE_INTELLIGENCE_STATUS;
  payload: {
    id: string;
    status: Intelligence['status'];
  };
}

/**
 * Action interface for selecting active intelligence item
 */
export interface SelectIntelligenceAction extends Action {
  type: IntelligenceActionTypes.SELECT_INTELLIGENCE;
  payload: string;
}

/**
 * Action interface for clearing intelligence errors
 */
export interface ClearIntelligenceErrorAction extends Action {
  type: IntelligenceActionTypes.CLEAR_INTELLIGENCE_ERROR;
}

/**
 * Union type of all possible intelligence actions
 * Used for type-safe action handling in reducers
 */
export type IntelligenceAction =
  | FetchIntelligenceRequestAction
  | FetchIntelligenceSuccessAction
  | FetchIntelligenceFailureAction
  | CreateIntelligenceRequestAction
  | CreateIntelligenceSuccessAction
  | CreateIntelligenceFailureAction
  | UpdateIntelligenceStatusAction
  | SelectIntelligenceAction
  | ClearIntelligenceErrorAction;