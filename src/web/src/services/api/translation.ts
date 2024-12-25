/**
 * @fileoverview API service module for managing detection translations between SIEM platforms
 * @version 1.0.0
 * Implements cross-platform translation capabilities with enhanced error handling and metrics
 */

// External imports
import axios from 'axios'; // ^1.6.0

// Internal imports
import { get, post } from '../../utils/api';
import {
  Translation,
  TranslationRequest,
  TranslationResponse,
  TranslationListResponse,
  TranslationPlatform,
  TranslationStatus,
  TranslationMetadata
} from '../../types/translation';

// Constants for translation rate limits per platform
const PLATFORM_RATE_LIMITS = {
  [TranslationPlatform.SPLUNK]: 1000,
  [TranslationPlatform.KQL]: 100,
  [TranslationPlatform.CHRONICLE]: 500,
  [TranslationPlatform.SIGMA]: 200
} as const;

// Cache TTL in seconds for translation results
const TRANSLATION_CACHE_TTL = 300; // 5 minutes

/**
 * Creates a new translation for a detection with enhanced error handling and rate limiting
 * @param request - Translation request parameters
 * @returns Promise resolving to created translation with accuracy metrics
 */
export const createTranslation = async (request: TranslationRequest): Promise<Translation> => {
  try {
    // Validate platform rate limits
    const rateLimit = PLATFORM_RATE_LIMITS[request.platform];
    if (!rateLimit) {
      throw new Error(`Unsupported translation platform: ${request.platform}`);
    }

    const response = await post<TranslationResponse>('/api/v1/translations', {
      ...request,
      options: {
        ...request.options,
        validate: true, // Enable validation by default
        accuracy_threshold: 0.95 // 95% minimum accuracy requirement
      }
    });

    // Validate translation accuracy
    if (response.data.translation.metadata.accuracy_score < 0.95) {
      throw new Error('Translation accuracy below required threshold');
    }

    return response.data.translation;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      if (statusCode === 429) {
        throw new Error(`Rate limit exceeded for platform ${request.platform}`);
      }
    }
    throw error;
  }
};

/**
 * Retrieves a specific translation by ID with caching support
 * @param translationId - Unique identifier of the translation
 * @returns Promise resolving to translation object
 */
export const getTranslation = async (translationId: string): Promise<Translation> => {
  try {
    const response = await get<TranslationResponse>(
      `/api/v1/translations/${translationId}`,
      {
        headers: {
          'Cache-Control': `max-age=${TRANSLATION_CACHE_TTL}`
        }
      }
    );
    return response.data.translation;
  } catch (error) {
    console.error('Failed to retrieve translation:', error);
    throw error;
  }
};

/**
 * Lists translations for a detection with pagination and filtering
 * @param detectionId - ID of the source detection
 * @param page - Page number for pagination
 * @param limit - Items per page
 * @param platform - Optional platform filter
 * @returns Promise resolving to paginated translation list
 */
export const listTranslations = async (
  detectionId: string,
  page: number = 1,
  limit: number = 10,
  platform?: TranslationPlatform
): Promise<TranslationListResponse> => {
  try {
    const params: Record<string, unknown> = {
      detection_id: detectionId,
      page,
      limit
    };

    if (platform) {
      params.platform = platform;
    }

    const response = await get<TranslationListResponse>('/api/v1/translations', {
      params
    });

    return response.data;
  } catch (error) {
    console.error('Failed to list translations:', error);
    throw error;
  }
};

/**
 * Validates a translation request against target platform requirements
 * @param request - Translation request to validate
 * @returns Promise resolving to validation results with metrics
 */
export const validateTranslation = async (
  request: TranslationRequest
): Promise<{
  valid: boolean;
  accuracy: number;
  messages: string[];
  metrics: TranslationMetadata;
}> => {
  try {
    const response = await post<{
      valid: boolean;
      accuracy: number;
      messages: string[];
      metrics: TranslationMetadata;
    }>('/api/v1/translations/validate', request);

    // Enhanced validation logging
    if (!response.data.valid) {
      console.warn('Translation validation failed:', {
        platform: request.platform,
        accuracy: response.data.accuracy,
        messages: response.data.messages
      });
    }

    return response.data;
  } catch (error) {
    console.error('Translation validation failed:', error);
    throw error;
  }
};

/**
 * Checks if a translation is complete and successful
 * @param translation - Translation object to check
 * @returns Boolean indicating translation success
 */
export const isTranslationSuccessful = (translation: Translation): boolean => {
  return (
    translation.status === TranslationStatus.COMPLETED &&
    translation.metadata.accuracy_score >= 0.95 &&
    !translation.error_message
  );
};

/**
 * Formats error details for failed translations
 * @param translation - Failed translation object
 * @returns Formatted error message
 */
export const getTranslationError = (translation: Translation): string => {
  if (translation.status !== TranslationStatus.FAILED) {
    return '';
  }

  return `Translation failed: ${translation.error_message || 'Unknown error'} (Code: ${
    translation.error_details?.code || 'UNKNOWN'
  })`;
};

export type {
  Translation,
  TranslationRequest,
  TranslationResponse,
  TranslationListResponse,
  TranslationPlatform,
  TranslationStatus,
  TranslationMetadata
};