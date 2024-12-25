/**
 * @fileoverview Redux state management type definitions for detection translations
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { 
  Translation, 
  TranslationPlatform, 
  TranslationStatus 
} from '../../types/translation';

/**
 * Action types for translation state management
 * Follows Redux best practices for action naming
 */
export enum TranslationActionTypes {
  FETCH_TRANSLATIONS_REQUEST = '@translation/FETCH_TRANSLATIONS_REQUEST',
  FETCH_TRANSLATIONS_SUCCESS = '@translation/FETCH_TRANSLATIONS_SUCCESS',
  FETCH_TRANSLATIONS_FAILURE = '@translation/FETCH_TRANSLATIONS_FAILURE',
  CREATE_TRANSLATION_REQUEST = '@translation/CREATE_TRANSLATION_REQUEST',
  CREATE_TRANSLATION_SUCCESS = '@translation/CREATE_TRANSLATION_SUCCESS',
  CREATE_TRANSLATION_FAILURE = '@translation/CREATE_TRANSLATION_FAILURE',
  SELECT_TRANSLATION = '@translation/SELECT_TRANSLATION',
  UPDATE_TRANSLATION_STATUS = '@translation/UPDATE_TRANSLATION_STATUS'
}

/**
 * Interface for translation state in Redux store
 * Includes performance metrics and status tracking
 */
export interface TranslationState {
  /** Array of translation objects */
  translations: Translation[];
  /** Currently selected translation ID */
  selectedTranslationId: string | null;
  /** Loading state indicator */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Total number of translations */
  total: number;
  /** Average processing time in milliseconds */
  processingTime: number;
  /** Translation success rate (0-100) */
  successRate: number;
}

/**
 * Interface for translation fetch request payload
 * Supports pagination and filtering by detection
 */
export interface FetchTranslationsPayload {
  /** Page number (1-based) */
  page: number;
  /** Items per page (rate limited to 100/hour) */
  limit: number;
  /** Optional detection ID filter */
  detection_id?: string;
}

/**
 * Interface for validation options in translation requests
 */
export interface ValidationOptions {
  /** Enable test case validation */
  runTestCases: boolean;
  /** Enable performance validation */
  checkPerformance: boolean;
  /** Maximum allowed execution time (ms) */
  maxExecutionTime?: number;
  /** Required success rate for test cases */
  requiredSuccessRate?: number;
}

/**
 * Interface for translation creation payload
 * Includes MITRE ATT&CK mapping support
 */
export interface CreateTranslationPayload {
  /** Source detection ID */
  detection_id: string;
  /** Target platform for translation */
  platform: TranslationPlatform;
  /** MITRE ATT&CK technique IDs */
  mitreTechniques: string[];
  /** MITRE ATT&CK tactic categories */
  mitreTactics: string[];
  /** Platform-specific configuration */
  platformConfig: Record<string, unknown>;
  /** Validation options */
  validationOptions: ValidationOptions;
}

/**
 * Action interfaces for translation state management
 */
export interface FetchTranslationsRequestAction {
  type: TranslationActionTypes.FETCH_TRANSLATIONS_REQUEST;
  payload: FetchTranslationsPayload;
}

export interface FetchTranslationsSuccessAction {
  type: TranslationActionTypes.FETCH_TRANSLATIONS_SUCCESS;
  payload: {
    translations: Translation[];
    total: number;
  };
}

export interface FetchTranslationsFailureAction {
  type: TranslationActionTypes.FETCH_TRANSLATIONS_FAILURE;
  payload: string;
}

export interface CreateTranslationRequestAction {
  type: TranslationActionTypes.CREATE_TRANSLATION_REQUEST;
  payload: CreateTranslationPayload;
}

export interface CreateTranslationSuccessAction {
  type: TranslationActionTypes.CREATE_TRANSLATION_SUCCESS;
  payload: Translation;
}

export interface CreateTranslationFailureAction {
  type: TranslationActionTypes.CREATE_TRANSLATION_FAILURE;
  payload: string;
}

export interface SelectTranslationAction {
  type: TranslationActionTypes.SELECT_TRANSLATION;
  payload: string | null;
}

export interface UpdateTranslationStatusAction {
  type: TranslationActionTypes.UPDATE_TRANSLATION_STATUS;
  payload: {
    translationId: string;
    status: TranslationStatus;
    error?: string;
  };
}

/**
 * Union type of all possible translation actions
 * Used for type checking in reducers
 */
export type TranslationAction =
  | FetchTranslationsRequestAction
  | FetchTranslationsSuccessAction
  | FetchTranslationsFailureAction
  | CreateTranslationRequestAction
  | CreateTranslationSuccessAction
  | CreateTranslationFailureAction
  | SelectTranslationAction
  | UpdateTranslationStatusAction;