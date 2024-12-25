/**
 * @fileoverview Redux action creators for managing detection translation state
 * @version 1.0.0
 * Implements cross-platform translation capabilities with enhanced metrics
 */

// External imports
import { Dispatch } from 'redux'; // v4.2.1

// Internal imports
import { TranslationActionTypes } from './types';
import {
  FetchTranslationsPayload,
  CreateTranslationPayload,
  TranslationAction,
  TranslationMetrics
} from './types';
import {
  createTranslation,
  listTranslations,
  validateTranslation
} from '../../services/api/translation';
import { ERROR_CODES } from '../../config/constants';

/**
 * Fetches translations with performance monitoring and pagination
 * @param payload - Fetch parameters including page and limit
 */
export const fetchTranslations = (payload: FetchTranslationsPayload) => {
  return async (dispatch: Dispatch<TranslationAction>): Promise<void> => {
    try {
      const startTime = performance.now();

      dispatch({
        type: TranslationActionTypes.FETCH_TRANSLATIONS_REQUEST,
        payload
      });

      const response = await listTranslations(
        payload.detection_id,
        payload.page,
        payload.limit
      );

      const processingTime = performance.now() - startTime;

      dispatch({
        type: TranslationActionTypes.FETCH_TRANSLATIONS_SUCCESS,
        payload: {
          translations: response.translations,
          total: response.total,
          metrics: {
            processingTime,
            successRate: response.translations.length > 0 ? 100 : 0
          }
        }
      });
    } catch (error) {
      dispatch({
        type: TranslationActionTypes.FETCH_TRANSLATIONS_FAILURE,
        payload: {
          error: error instanceof Error ? error.message : 'Failed to fetch translations',
          code: ERROR_CODES.API.SERVICE_UNAVAILABLE
        }
      });
    }
  };
};

/**
 * Creates a new translation with accuracy validation and metrics tracking
 * @param payload - Translation creation parameters
 */
export const createNewTranslation = (payload: CreateTranslationPayload) => {
  return async (dispatch: Dispatch<TranslationAction>): Promise<void> => {
    try {
      const startTime = performance.now();

      dispatch({
        type: TranslationActionTypes.CREATE_TRANSLATION_REQUEST,
        payload
      });

      // Validate translation before creation
      const validationResult = await validateTranslation({
        detection_id: payload.detection_id,
        platform: payload.platform,
        options: payload.platformConfig
      });

      // Check if translation meets accuracy threshold (95%)
      if (validationResult.accuracy < 0.95) {
        throw new Error(`Translation accuracy (${validationResult.accuracy * 100}%) below required threshold (95%)`);
      }

      const translation = await createTranslation({
        detection_id: payload.detection_id,
        platform: payload.platform,
        options: {
          ...payload.platformConfig,
          mitreTechniques: payload.mitreTechniques,
          mitreTactics: payload.mitreTactics
        }
      });

      const processingTime = performance.now() - startTime;

      dispatch({
        type: TranslationActionTypes.CREATE_TRANSLATION_SUCCESS,
        payload: {
          translation,
          metrics: {
            processingTime,
            accuracyScore: validationResult.accuracy * 100,
            validationMessages: validationResult.messages
          }
        }
      });
    } catch (error) {
      dispatch({
        type: TranslationActionTypes.CREATE_TRANSLATION_FAILURE,
        payload: {
          error: error instanceof Error ? error.message : 'Failed to create translation',
          code: ERROR_CODES.DETECTION.TRANSLATION_FAILED
        }
      });
    }
  };
};

/**
 * Selects a translation for viewing or editing
 * @param translationId - ID of translation to select
 */
export const selectTranslation = (translationId: string): TranslationAction => ({
  type: TranslationActionTypes.SELECT_TRANSLATION,
  payload: translationId
});

/**
 * Updates translation status with audit logging
 * @param translationId - ID of translation to update
 * @param status - New translation status
 * @param error - Optional error message
 */
export const updateTranslationStatus = (
  translationId: string,
  status: string,
  error?: string
): TranslationAction => {
  // Log status change for audit purposes
  console.info('Translation status update:', {
    translationId,
    status,
    timestamp: new Date().toISOString()
  });

  return {
    type: TranslationActionTypes.UPDATE_TRANSLATION_STATUS,
    payload: {
      translationId,
      status,
      error
    }
  };
};

/**
 * Type exports for consumers
 */
export type {
  FetchTranslationsPayload,
  CreateTranslationPayload,
  TranslationAction,
  TranslationMetrics
};