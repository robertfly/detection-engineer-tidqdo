/**
 * @fileoverview Redux reducer for intelligence state management with enhanced error handling and pagination
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - redux@4.2.1
import { Reducer } from 'redux';

// Internal imports
import {
  IntelligenceState,
  IntelligenceAction,
  IntelligenceActionTypes,
} from './types';

/**
 * Initial state for intelligence management
 * Implements pagination, loading states, and error handling
 */
const initialState: IntelligenceState = {
  items: [],
  selectedId: null,
  loading: false,
  error: null,
  total: 0,
  currentPage: 1,
  pageSize: 20,
};

/**
 * Redux reducer for handling intelligence state updates
 * Implements comprehensive error handling and pagination support
 * @param state - Current intelligence state
 * @param action - Dispatched intelligence action
 * @returns Updated intelligence state
 */
export const intelligenceReducer: Reducer<IntelligenceState, IntelligenceAction> = (
  state = initialState,
  action
): IntelligenceState => {
  switch (action.type) {
    case IntelligenceActionTypes.FETCH_INTELLIGENCE_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
        currentPage: action.payload.page,
        pageSize: action.payload.pageSize,
      };

    case IntelligenceActionTypes.FETCH_INTELLIGENCE_SUCCESS:
      return {
        ...state,
        loading: false,
        items: action.payload.items,
        total: action.payload.total,
        error: null,
      };

    case IntelligenceActionTypes.FETCH_INTELLIGENCE_FAILURE:
      return {
        ...state,
        loading: false,
        error: {
          code: action.payload.code,
          message: action.payload.message,
        },
      };

    case IntelligenceActionTypes.CREATE_INTELLIGENCE_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
      };

    case IntelligenceActionTypes.CREATE_INTELLIGENCE_SUCCESS:
      return {
        ...state,
        loading: false,
        items: [action.payload, ...state.items],
        total: state.total + 1,
        error: null,
      };

    case IntelligenceActionTypes.CREATE_INTELLIGENCE_FAILURE:
      return {
        ...state,
        loading: false,
        error: {
          code: action.payload.code,
          message: action.payload.message,
        },
      };

    case IntelligenceActionTypes.UPDATE_INTELLIGENCE_STATUS:
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id
            ? { ...item, status: action.payload.status }
            : item
        ),
      };

    case IntelligenceActionTypes.SELECT_INTELLIGENCE:
      return {
        ...state,
        selectedId: action.payload,
      };

    case IntelligenceActionTypes.CLEAR_INTELLIGENCE_ERROR:
      return {
        ...state,
        error: null,
      };

    case IntelligenceActionTypes.SET_INTELLIGENCE_PAGE:
      return {
        ...state,
        currentPage: action.payload.page,
        pageSize: action.payload.pageSize || state.pageSize,
      };

    default:
      // Ensure type safety by validating action type
      return state;
  }
};

/**
 * Type guard to check if an error is an intelligence-specific error
 * @param error - Error object to check
 * @returns Boolean indicating if error is an intelligence error
 */
export const isIntelligenceError = (error: unknown): error is { code: number; message: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'number' &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { code: number }).code >= 3000 &&
    (error as { code: number }).code <= 3999
  );
};