/**
 * @fileoverview Enhanced translation form component with comprehensive validation and monitoring
 * @version 1.0.0
 * Implements Material Design 3.0 specifications with accessibility and performance features
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import classnames from 'classnames'; // v2.3.0
import { Button, ButtonProps } from '../common/Button';
import { Select, SelectProps } from '../common/Select';
import { useTheme } from '../../hooks/useTheme';
import {
  TranslationPlatform,
  TranslationRequest,
  ValidationResult,
  TranslationStatus,
} from '../../types/translation';
import {
  createTranslation,
  validateTranslation,
  checkRateLimit,
} from '../../services/api/translation';

// Constants for accessibility and analytics
const ARIA_LABELS = {
  FORM: 'translation-form',
  PLATFORM: 'platform-select',
  SUBMIT: 'submit-button',
  CANCEL: 'cancel-button',
  ERROR: 'error-message',
} as const;

// Platform options with enhanced metadata
const PLATFORM_OPTIONS = [
  { value: TranslationPlatform.SIGMA, label: 'SIGMA', description: 'Generic SIEM format' },
  { value: TranslationPlatform.KQL, label: 'KQL', description: 'Microsoft Sentinel' },
  { value: TranslationPlatform.SPL, label: 'SPL', description: 'Splunk' },
  { value: TranslationPlatform.YARA_L, label: 'YARA-L', description: 'Chronicle' },
];

// Interface for form analytics
interface TranslationAnalytics {
  trackEvent: (event: string, data: Record<string, unknown>) => void;
  trackError: (error: Error, context: Record<string, unknown>) => void;
  trackTiming: (metric: string, duration: number) => void;
}

// Enhanced props interface
export interface TranslationFormProps {
  /** Detection ID to translate */
  detectionId: string;
  /** Submit handler */
  onSubmit: (translation: TranslationRequest) => Promise<void>;
  /** Cancel handler */
  onCancel: () => void;
  /** Loading state */
  loading?: boolean;
  /** Dark mode override */
  darkMode?: boolean;
  /** Analytics implementation */
  analytics?: TranslationAnalytics;
}

/**
 * Enhanced translation form component with comprehensive validation and monitoring
 */
export const TranslationForm: React.FC<TranslationFormProps> = ({
  detectionId,
  onSubmit,
  onCancel,
  loading = false,
  darkMode,
  analytics,
}) => {
  // Theme and styling
  const { theme, isDarkMode } = useTheme();
  const effectiveDarkMode = darkMode ?? isDarkMode;

  // Form state
  const [selectedPlatform, setSelectedPlatform] = useState<TranslationPlatform | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Performance tracking
  const startTime = useMemo(() => performance.now(), []);

  // Handle platform selection with validation
  const handlePlatformChange = useCallback(async (platform: TranslationPlatform) => {
    try {
      setSelectedPlatform(platform);
      setError(null);
      setIsValidating(true);

      analytics?.trackEvent('platform_selected', { platform });

      // Check rate limits before validation
      const rateLimitStatus = await checkRateLimit(platform);
      if (!rateLimitStatus.remaining) {
        throw new Error(`Rate limit exceeded for ${platform}. Resets in ${rateLimitStatus.reset}s`);
      }

      // Validate platform compatibility
      const result = await validateTranslation({
        detection_id: detectionId,
        platform,
        options: { validate: true }
      });

      setValidationResult(result);
      
      if (!result.valid) {
        setError(`Validation failed: ${result.messages.join(', ')}`);
        analytics?.trackError(new Error('Validation failed'), { platform, messages: result.messages });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      analytics?.trackError(error as Error, { platform });
    } finally {
      setIsValidating(false);
    }
  }, [detectionId, analytics]);

  // Handle form submission
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!selectedPlatform || !validationResult?.valid) {
      return;
    }

    try {
      const translationRequest: TranslationRequest = {
        detection_id: detectionId,
        platform: selectedPlatform,
        options: {
          accuracy_threshold: 0.95,
          include_metadata: true
        }
      };

      await onSubmit(translationRequest);
      
      analytics?.trackEvent('translation_submitted', {
        platform: selectedPlatform,
        accuracy: validationResult.accuracy
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      setError(errorMessage);
      analytics?.trackError(error as Error, { platform: selectedPlatform });
    }
  }, [detectionId, selectedPlatform, validationResult, onSubmit, analytics]);

  // Track form render performance
  useEffect(() => {
    const loadTime = performance.now() - startTime;
    analytics?.trackTiming('form_render', loadTime);
  }, [startTime, analytics]);

  // Generate form classes
  const formClasses = classnames(
    'space-y-6',
    'p-6',
    'rounded-lg',
    'border',
    {
      'bg-white border-gray-200': !effectiveDarkMode,
      'bg-gray-800 border-gray-700': effectiveDarkMode,
    }
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={formClasses}
      aria-label={ARIA_LABELS.FORM}
      noValidate
    >
      <Select
        id={ARIA_LABELS.PLATFORM}
        name="platform"
        label="Target Platform"
        options={PLATFORM_OPTIONS}
        value={selectedPlatform}
        placeholder="Select target platform"
        disabled={loading}
        isSearchable
        required
        error={error}
        className="w-full"
        onChange={handlePlatformChange}
        aria-label="Select target platform for translation"
        aria-invalid={!!error}
        aria-describedby={error ? ARIA_LABELS.ERROR : undefined}
      />

      {validationResult && !error && (
        <div className="text-sm text-green-600 dark:text-green-400">
          Validation passed with {(validationResult.accuracy * 100).toFixed(1)}% accuracy
        </div>
      )}

      {error && (
        <div
          id={ARIA_LABELS.ERROR}
          className="text-sm text-error-500 dark:text-error-400"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <Button
          variant="tertiary"
          onClick={onCancel}
          disabled={loading}
          aria-label={ARIA_LABELS.CANCEL}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!selectedPlatform || !validationResult?.valid || loading}
          loading={loading || isValidating}
          aria-label={ARIA_LABELS.SUBMIT}
        >
          Translate
        </Button>
      </div>
    </form>
  );
};

export default TranslationForm;