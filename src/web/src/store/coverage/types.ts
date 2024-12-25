/**
 * @fileoverview Redux type definitions for coverage state management
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { Coverage, CoverageMatrix, TacticCoverage, CoverageSummary } from '../../types/coverage';

/**
 * Enumeration of all possible coverage-related Redux action types
 * Namespaced to prevent conflicts with other action types
 */
export enum CoverageActionTypes {
  FETCH_COVERAGE_REQUEST = 'coverage/fetchRequest',
  FETCH_COVERAGE_SUCCESS = 'coverage/fetchSuccess',
  FETCH_COVERAGE_FAILURE = 'coverage/fetchFailure',
  UPDATE_COVERAGE = 'coverage/update',
  RESET_COVERAGE = 'coverage/reset'
}

/**
 * Interface defining the shape of the coverage Redux state
 * All properties are readonly to enforce immutability
 */
export interface CoverageState {
  /** Current coverage matrix data or null if not loaded */
  readonly matrix: CoverageMatrix | null;
  
  /** Loading state indicator */
  readonly loading: boolean;
  
  /** Error message if fetch/update failed */
  readonly error: string | null;
  
  /** Timestamp of last successful update */
  readonly lastUpdated: number | null;
}

/**
 * Interface for the coverage fetch request action
 * Dispatched when initiating a coverage data fetch
 */
export interface FetchCoverageRequestAction {
  readonly type: CoverageActionTypes.FETCH_COVERAGE_REQUEST;
}

/**
 * Interface for the coverage fetch success action
 * Dispatched when coverage data is successfully retrieved
 */
export interface FetchCoverageSuccessAction {
  readonly type: CoverageActionTypes.FETCH_COVERAGE_SUCCESS;
  readonly payload: Readonly<CoverageMatrix>;
}

/**
 * Interface for the coverage fetch failure action
 * Dispatched when coverage data fetch fails
 */
export interface FetchCoverageFailureAction {
  readonly type: CoverageActionTypes.FETCH_COVERAGE_FAILURE;
  readonly payload: string;
}

/**
 * Interface for the coverage update action
 * Dispatched when coverage data needs to be updated
 */
export interface UpdateCoverageAction {
  readonly type: CoverageActionTypes.UPDATE_COVERAGE;
  readonly payload: Readonly<CoverageMatrix>;
}

/**
 * Interface for the coverage reset action
 * Dispatched when coverage state needs to be reset to initial values
 */
export interface ResetCoverageAction {
  readonly type: CoverageActionTypes.RESET_COVERAGE;
}

/**
 * Discriminated union type of all possible coverage actions
 * Used for exhaustive type checking in reducers
 */
export type CoverageAction =
  | FetchCoverageRequestAction
  | FetchCoverageSuccessAction
  | FetchCoverageFailureAction
  | UpdateCoverageAction
  | ResetCoverageAction;