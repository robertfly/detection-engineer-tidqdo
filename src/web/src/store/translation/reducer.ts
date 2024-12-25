/**
 * @fileoverview Redux reducer for managing detection translation state
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { Reducer } from 'redux'; // v4.2.1

// Internal imports
import { 
  TranslationActionTypes,
  TranslationState,
  TranslationAction,
  Translation
} from './types';
import { TranslationStatus } from '../../types/translation';

/**
 * Initial state for translation management
 * Includes rate limiting and performance metrics
 */
const initialState: TranslationState = {
  translations: [],
  selectedTranslationId: null,
  loading: false,
  error: null,
  total: 0,
  rateLimitRemaining: 100, // Rate limit of 100 requests per hour
  metrics: {
    successCount: 0,
    failureCount: 0,
    averageTranslationTime: 0,
    lastTranslationTime: 0
  },
  processingTime: 0,
  successRate: 0
};

/**
 * Updates performance metrics based on translation results
 * @param metrics Current metrics state
 * @param success Whether the translation succeeded
 * @param processingTime Time taken for translation
 */
const updateMetrics = (
  metrics: TranslationState['metrics'],
  success: boolean,
  processingTime: number
) => {
  const newSuccessCount = success ? metrics.successCount + 1 : metrics.successCount;
  const newFailureCount = success ? metrics.failureCount : metrics.failureCount + 1;
  const totalCount = newSuccessCount + newFailureCount;
  
  return {
    successCount: newSuccessCount,
    failureCount: newFailureCount,
    averageTranslationTime: 
      (metrics.averageTranslationTime * (totalCount - 1) + processingTime) / totalCount,
    lastTranslationTime: processingTime
  };
};

/**
 * Updates translation array while maintaining referential integrity
 * @param translations Current translations array
 * @param updatedTranslation Translation to update
 */
const updateTranslationArray = (
  translations: Translation[],
  updatedTranslation: Translation
): Translation[] => {
  const index = translations.findIndex(t => t.id === updatedTranslation.id);
  if (index === -1) {
    return [...translations, updatedTranslation];
  }
  return [
    ...translations.slice(0, index),
    updatedTranslation,
    ...translations.slice(index + 1)
  ];
};

/**
 * Redux reducer for translation state management
 * Handles translation operations with comprehensive error states
 */
export const translationReducer: Reducer<TranslationState, TranslationAction> = (
  state = initialState,
  action
): TranslationState => {
  switch (action.type) {
    case TranslationActionTypes.FETCH_TRANSLATIONS_REQUEST:
      return {
        ...state,
        loading: true,
        error: null
      };

    case TranslationActionTypes.FETCH_TRANSLATIONS_SUCCESS:
      return {
        ...state,
        loading: false,
        translations: action.payload.translations,
        total: action.payload.total,
        error: null,
        successRate: (action.payload.translations.filter(
          t => t.status === TranslationStatus.COMPLETED
        ).length / action.payload.total) * 100
      };

    case TranslationActionTypes.FETCH_TRANSLATIONS_FAILURE:
      return {
        ...state,
        loading: false,
        error: {
          code: '4000',
          message: action.payload,
          details: 'Failed to fetch translations'
        }
      };

    case TranslationActionTypes.CREATE_TRANSLATION_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
        rateLimitRemaining: state.rateLimitRemaining - 1
      };

    case TranslationActionTypes.CREATE_TRANSLATION_SUCCESS: {
      const processingTime = Date.now() - new Date(action.payload.created_at).getTime();
      return {
        ...state,
        loading: false,
        translations: updateTranslationArray(state.translations, action.payload),
        error: null,
        metrics: updateMetrics(state.metrics, true, processingTime),
        processingTime,
        successRate: ((state.metrics.successCount + 1) / 
          (state.metrics.successCount + state.metrics.failureCount + 1)) * 100
      };
    }

    case TranslationActionTypes.CREATE_TRANSLATION_FAILURE:
      // Handle rate limit errors specifically
      if (action.payload.includes('Rate limit exceeded')) {
        return {
          ...state,
          loading: false,
          error: {
            code: '4001',
            message: 'Rate limit exceeded',
            details: 'Please try again in the next hour'
          },
          rateLimitRemaining: 0,
          metrics: updateMetrics(state.metrics, false, 0)
        };
      }
      return {
        ...state,
        loading: false,
        error: {
          code: '4002',
          message: action.payload,
          details: 'Translation creation failed'
        },
        metrics: updateMetrics(state.metrics, false, 0)
      };

    case TranslationActionTypes.SELECT_TRANSLATION:
      return {
        ...state,
        selectedTranslationId: action.payload,
        error: null
      };

    case TranslationActionTypes.UPDATE_TRANSLATION_STATUS: {
      const updatedTranslations = state.translations.map(translation =>
        translation.id === action.payload.translationId
          ? { ...translation, status: action.payload.status }
          : translation
      );

      return {
        ...state,
        translations: updatedTranslations,
        error: action.payload.error ? {
          code: '4003',
          message: action.payload.error,
          details: 'Translation status update failed'
        } : null
      };
    }

    case TranslationActionTypes.BATCH_TRANSLATION_REQUEST:
      return {
        ...state,
        loading: true,
        error: null,
        rateLimitRemaining: state.rateLimitRemaining - action.payload.length
      };

    case TranslationActionTypes.TRANSLATION_RETRY: {
      const translation = state.translations.find(t => t.id === action.payload);
      if (!translation) {
        return state;
      }
      return {
        ...state,
        translations: state.translations.map(t =>
          t.id === action.payload
            ? { ...t, status: TranslationStatus.PENDING, error_message: null }
            : t
        ),
        rateLimitRemaining: state.rateLimitRemaining - 1,
        error: null
      };
    }

    default:
      return state;
  }
};