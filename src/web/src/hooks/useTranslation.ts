/**
 * @fileoverview React hook for managing detection translations with enhanced performance monitoring
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { 
  useState, 
  useEffect, 
  useCallback, 
  useMemo 
} from 'react'; // ^18.2.0
import { 
  useDispatch, 
  useSelector 
} from 'react-redux'; // ^8.0.0

// Internal imports
import {
  fetchTranslations,
  createNewTranslation,
  selectTranslation,
  updateTranslationStatus,
  trackTranslationMetrics
} from '../store/translation/actions';
import {
  Translation,
  TranslationPlatform,
  TranslationStatus,
  TranslationMetrics,
  TranslationError,
  RateLimit
} from '../types/translation';

// Constants for performance thresholds
const PERFORMANCE_THRESHOLDS = {
  TRANSLATION_TIME: 5000, // 5 seconds
  VALIDATION_TIME: 2000,  // 2 seconds
  MIN_ACCURACY: 0.95      // 95% minimum accuracy
};

interface UseTranslationOptions {
  autoValidate?: boolean;
  performanceMonitoring?: boolean;
  rateLimitThreshold?: number;
}

interface TranslationHookState {
  translations: Translation[];
  selectedTranslation: Translation | null;
  loading: boolean;
  error: TranslationError | null;
  metrics: TranslationMetrics;
  rateLimit: RateLimit;
}

/**
 * Custom hook for managing detection translations with performance monitoring
 * and accuracy validation
 * 
 * @param detectionId - ID of the detection to translate
 * @param options - Configuration options for translation management
 * @returns Translation state and management functions
 */
export const useTranslation = (
  detectionId: string,
  options: UseTranslationOptions = {}
) => {
  const dispatch = useDispatch();
  const [state, setState] = useState<TranslationHookState>({
    translations: [],
    selectedTranslation: null,
    loading: false,
    error: null,
    metrics: {
      successCount: 0,
      failureCount: 0,
      averageTranslationTime: 0,
      lastTranslationTime: 0
    },
    rateLimit: {
      remaining: 100,
      reset: Date.now() + 3600000 // 1 hour
    }
  });

  /**
   * Fetches translations for the specified detection
   * Implements pagination and performance monitoring
   */
  const fetchTranslationsHandler = useCallback(async (
    page: number = 1,
    limit: number = 20
  ) => {
    try {
      const startTime = performance.now();
      setState(prev => ({ ...prev, loading: true, error: null }));

      const response = await dispatch(fetchTranslations({
        detection_id: detectionId,
        page,
        limit
      }));

      const processingTime = performance.now() - startTime;
      if (options.performanceMonitoring && processingTime > PERFORMANCE_THRESHOLDS.TRANSLATION_TIME) {
        console.warn('Translation fetch exceeded performance threshold:', {
          processingTime,
          threshold: PERFORMANCE_THRESHOLDS.TRANSLATION_TIME
        });
      }

      setState(prev => ({
        ...prev,
        translations: response.payload.translations,
        loading: false,
        metrics: {
          ...prev.metrics,
          lastTranslationTime: processingTime
        }
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Failed to fetch translations'
        }
      }));
    }
  }, [detectionId, dispatch, options.performanceMonitoring]);

  /**
   * Creates a new translation with accuracy validation
   * Implements rate limiting and performance monitoring
   */
  const createTranslation = useCallback(async (
    platform: TranslationPlatform,
    platformConfig: Record<string, unknown>
  ) => {
    try {
      // Check rate limits
      if (state.rateLimit.remaining <= (options.rateLimitThreshold || 5)) {
        throw new Error('Rate limit threshold reached');
      }

      const startTime = performance.now();
      setState(prev => ({ ...prev, loading: true, error: null }));

      const response = await dispatch(createNewTranslation({
        detection_id: detectionId,
        platform,
        platformConfig,
        validationOptions: {
          runTestCases: options.autoValidate !== false,
          checkPerformance: options.performanceMonitoring !== false,
          maxExecutionTime: PERFORMANCE_THRESHOLDS.TRANSLATION_TIME,
          requiredSuccessRate: PERFORMANCE_THRESHOLDS.MIN_ACCURACY
        }
      }));

      const processingTime = performance.now() - startTime;
      
      // Update metrics
      setState(prev => ({
        ...prev,
        loading: false,
        translations: [...prev.translations, response.payload],
        metrics: {
          ...prev.metrics,
          successCount: prev.metrics.successCount + 1,
          averageTranslationTime: (
            (prev.metrics.averageTranslationTime * prev.metrics.successCount + processingTime) /
            (prev.metrics.successCount + 1)
          ),
          lastTranslationTime: processingTime
        },
        rateLimit: {
          ...prev.rateLimit,
          remaining: prev.rateLimit.remaining - 1
        }
      }));

      return response.payload;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create translation'
        },
        metrics: {
          ...prev.metrics,
          failureCount: prev.metrics.failureCount + 1
        }
      }));
      throw error;
    }
  }, [detectionId, dispatch, options, state.rateLimit]);

  /**
   * Selects a translation for viewing or editing
   * Updates metrics tracking
   */
  const selectTranslationHandler = useCallback((translationId: string) => {
    const translation = state.translations.find(t => t.id === translationId);
    if (translation) {
      setState(prev => ({ ...prev, selectedTranslation: translation }));
      dispatch(selectTranslation(translationId));
    }
  }, [state.translations, dispatch]);

  /**
   * Updates translation status with error handling
   * Tracks performance metrics
   */
  const updateStatus = useCallback(async (
    translationId: string,
    status: TranslationStatus,
    error?: string
  ) => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      await dispatch(updateTranslationStatus(translationId, status, error));
      
      setState(prev => ({
        ...prev,
        loading: false,
        translations: prev.translations.map(t =>
          t.id === translationId ? { ...t, status, error_message: error || null } : t
        )
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update translation status'
        }
      }));
    }
  }, [dispatch]);

  // Calculate success rate metrics
  const successRate = useMemo(() => {
    const total = state.metrics.successCount + state.metrics.failureCount;
    return total > 0 ? (state.metrics.successCount / total) * 100 : 0;
  }, [state.metrics]);

  // Initialize translations on mount
  useEffect(() => {
    fetchTranslationsHandler();
  }, [fetchTranslationsHandler]);

  return {
    // State
    translations: state.translations,
    selectedTranslation: state.selectedTranslation,
    loading: state.loading,
    error: state.error,
    
    // Metrics
    metrics: {
      ...state.metrics,
      successRate
    },
    rateLimit: state.rateLimit,
    
    // Actions
    fetchTranslations: fetchTranslationsHandler,
    createTranslation,
    selectTranslation: selectTranslationHandler,
    updateStatus,
    
    // Validation helper
    validateAccuracy: useCallback((accuracy: number) => {
      return accuracy >= PERFORMANCE_THRESHOLDS.MIN_ACCURACY;
    }, [])
  };
};

export type { 
  UseTranslationOptions,
  TranslationHookState,
  TranslationMetrics,
  TranslationError,
  RateLimit
};