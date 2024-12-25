/**
 * @fileoverview Translation creation page component with comprehensive error handling,
 * loading states, and analytics tracking.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from '@mui/material';

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import TranslationForm from '../../components/translation/TranslationForm';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { createTranslation } from '../../services/api/translation';
import type { TranslationRequest } from '../../types/translation';

/**
 * Analytics tracking interface for translation events
 */
const translationAnalytics = {
  trackEvent: (event: string, data: Record<string, unknown>) => {
    // Implementation would be provided by analytics service
    console.debug('Translation Event:', event, data);
  },
  trackError: (error: Error, context: Record<string, unknown>) => {
    console.error('Translation Error:', error, context);
  },
  trackTiming: (metric: string, duration: number) => {
    console.debug('Translation Timing:', metric, duration);
  }
};

/**
 * Translation creation page component implementing Material Design 3.0
 * specifications with comprehensive error handling and analytics
 */
const TranslationCreate: React.FC = () => {
  // Hooks
  const { detectionId } = useParams<{ detectionId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [startTime] = useState(() => performance.now());

  // Permission check
  useEffect(() => {
    if (!hasPermission('write:translations')) {
      enqueueSnackbar('Insufficient permissions to create translations', {
        variant: 'error',
        anchorOrigin: { vertical: 'top', horizontal: 'center' }
      });
      navigate('/dashboard');
    }
  }, [hasPermission, navigate, enqueueSnackbar]);

  /**
   * Handles successful translation creation
   * @param translation - Created translation data
   */
  const handleSubmitSuccess = useCallback(async (translation: TranslationRequest) => {
    try {
      setIsLoading(true);
      const response = await createTranslation(translation);

      // Track successful creation
      translationAnalytics.trackEvent('translation_created', {
        detectionId: translation.detection_id,
        platform: translation.platform,
        duration: performance.now() - startTime
      });

      // Show success notification
      enqueueSnackbar('Translation created successfully', {
        variant: 'success',
        anchorOrigin: { vertical: 'top', horizontal: 'center' }
      });

      // Navigate to translations list
      navigate('/translations', {
        state: { translationId: response.id }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create translation';
      
      translationAnalytics.trackError(
        error instanceof Error ? error : new Error(errorMessage),
        { detectionId: translation.detection_id }
      );

      enqueueSnackbar(errorMessage, {
        variant: 'error',
        anchorOrigin: { vertical: 'top', horizontal: 'center' }
      });
    } finally {
      setIsLoading(false);
    }
  }, [navigate, enqueueSnackbar, startTime]);

  /**
   * Handles form cancellation
   */
  const handleCancel = useCallback(() => {
    translationAnalytics.trackEvent('translation_cancelled', {
      detectionId,
      timeSpent: performance.now() - startTime
    });
    navigate(-1);
  }, [navigate, detectionId, startTime]);

  /**
   * Handles component errors
   */
  const handleError = useCallback((error: Error) => {
    translationAnalytics.trackError(error, { detectionId });
    enqueueSnackbar('An error occurred. Please try again.', {
      variant: 'error',
      anchorOrigin: { vertical: 'top', horizontal: 'center' }
    });
  }, [detectionId, enqueueSnackbar]);

  if (!detectionId) {
    return null;
  }

  return (
    <DashboardLayout>
      <ErrorBoundary onError={handleError}>
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-semibold mb-6">
            Create Translation
          </h1>
          
          <TranslationForm
            detectionId={detectionId}
            onSubmit={handleSubmitSuccess}
            onCancel={handleCancel}
            loading={isLoading}
            analytics={translationAnalytics}
          />
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

// Display name for debugging
TranslationCreate.displayName = 'TranslationCreate';

export default TranslationCreate;