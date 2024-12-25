/**
 * @fileoverview Redux reducer for managing coverage analysis state
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports - v4.2.1
import { Reducer } from 'redux';

// Internal imports
import { CoverageState, CoverageAction, CoverageActionTypes } from './types';
import { Coverage, CoverageMatrix } from '../../types/coverage';

/**
 * Initial state for coverage reducer with strict typing
 */
const initialState: CoverageState = {
  matrix: null,
  loading: false,
  error: null,
  lastUpdated: null,
  metrics: {
    total: 0,
    covered: 0,
    percentage: 0
  },
  validationErrors: []
};

/**
 * Calculates coverage metrics from a coverage matrix
 * @param matrix - The coverage matrix to analyze
 * @returns Object containing coverage metrics
 */
const calculateMetrics = (matrix: CoverageMatrix) => {
  const total = Object.keys(matrix).length;
  const covered = Object.values(matrix).filter(item => item.coverage_percentage > 0).length;
  const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;

  return {
    total,
    covered,
    percentage
  };
};

/**
 * Validates coverage matrix data
 * @param matrix - The coverage matrix to validate
 * @returns Array of validation error messages
 */
const validateCoverageMatrix = (matrix: CoverageMatrix): string[] => {
  const errors: string[] = [];

  if (!matrix) {
    errors.push('Coverage matrix cannot be null');
    return errors;
  }

  Object.entries(matrix).forEach(([id, coverage]) => {
    if (!coverage.mitre_id) {
      errors.push(`Invalid MITRE ID for entry ${id}`);
    }
    if (coverage.coverage_percentage < 0 || coverage.coverage_percentage > 100) {
      errors.push(`Invalid coverage percentage for ${id}`);
    }
    if (coverage.detection_count < 0) {
      errors.push(`Invalid detection count for ${id}`);
    }
  });

  return errors;
};

/**
 * Redux reducer for managing coverage analysis state
 * Implements comprehensive error handling and immutable state updates
 */
const coverageReducer: Reducer<CoverageState, CoverageAction> = (
  state = initialState,
  action
): CoverageState => {
  switch (action.type) {
    case CoverageActionTypes.FETCH_COVERAGE_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
        validationErrors: []
      };

    case CoverageActionTypes.FETCH_COVERAGE_SUCCESS: {
      const validationErrors = validateCoverageMatrix(action.payload);
      if (validationErrors.length > 0) {
        return {
          ...state,
          loading: false,
          error: 'Coverage matrix validation failed',
          validationErrors,
          lastUpdated: Date.now()
        };
      }

      return {
        ...state,
        matrix: action.payload,
        metrics: calculateMetrics(action.payload),
        loading: false,
        error: null,
        validationErrors: [],
        lastUpdated: Date.now()
      };
    }

    case CoverageActionTypes.FETCH_COVERAGE_FAILURE:
      return {
        ...state,
        loading: false,
        error: action.payload,
        validationErrors: [],
        lastUpdated: Date.now()
      };

    case CoverageActionTypes.UPDATE_COVERAGE: {
      const validationErrors = validateCoverageMatrix(action.payload);
      if (validationErrors.length > 0) {
        return {
          ...state,
          error: 'Coverage update validation failed',
          validationErrors,
          lastUpdated: Date.now()
        };
      }

      return {
        ...state,
        matrix: action.payload,
        metrics: calculateMetrics(action.payload),
        error: null,
        validationErrors: [],
        lastUpdated: Date.now()
      };
    }

    case CoverageActionTypes.RESET_COVERAGE:
      return {
        ...initialState,
        lastUpdated: Date.now()
      };

    default:
      // Ensure type safety by validating action type
      const _exhaustiveCheck: never = action;
      return state;
  }
};

export default coverageReducer;