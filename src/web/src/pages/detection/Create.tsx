/**
 * @fileoverview Page component for creating new security detections
 * Implements Material Design 3.0 with enhanced accessibility and validation
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material';
import { useRetry } from 'react-use';

// Internal imports
import DetectionForm from '../../components/detection/DetectionForm';
import { useDetection } from '../../hooks/useDetection';
import { Toast } from '../../components/common/Toast';
import type { DetectionCreate } from '../../types/detection';

// Performance monitoring constants
const PERFORMANCE_THRESHOLD = 2000; // 2 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Create Detection Page Component
 * 
 * Provides an interface for creating new security detections with
 * real-time validation, accessibility features, and error handling.
 */
const CreateDetection: React.FC = React.memo(() => {
  // Hooks
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { createDetection, loading } = useDetection();
  const [error, setError] = useState<string | null>(null);

  // Performance tracking
  const startTime = React.useRef(Date.now());

  // Retry mechanism for failed submissions
  const { retry } = useRetry({
    retries: MAX_RETRIES,
    minTimeout: RETRY_DELAY,
    maxTimeout: RETRY_DELAY * 3,
    onRetry: (error, attempt) => {
      console.warn(`Retrying detection creation (attempt ${attempt}):`, error);
      Toast.warning(`Retrying submission (attempt ${attempt} of ${MAX_RETRIES})...`);
    }
  });

  /**
   * Handles form submission with validation and error handling
   */
  const handleSubmit = useCallback(async (detectionData: DetectionCreate) => {
    try {
      startTime.current = Date.now();

      // Attempt creation with retry mechanism
      const detection = await retry(async () => {
        return await createDetection(detectionData);
      });

      // Track performance
      const duration = Date.now() - startTime.current;
      if (duration > PERFORMANCE_THRESHOLD) {
        console.warn('Detection creation exceeded performance threshold', {
          duration,
          threshold: PERFORMANCE_THRESHOLD
        });
      }

      // Show success message
      Toast.success('Detection created successfully');

      // Navigate to the detection details page
      navigate(`/detections/${detection.id}`);
    } catch (error) {
      console.error('Failed to create detection:', error);
      setError(error instanceof Error ? error.message : 'Failed to create detection');
      Toast.error('Failed to create detection. Please try again.');
    }
  }, [createDetection, navigate, retry]);

  // Clear error state on unmount
  useEffect(() => {
    return () => setError(null);
  }, []);

  return (
    <div
      className="create-detection-page"
      role="main"
      aria-label="Create Detection"
    >
      <header className="page-header">
        <h1 className="text-2xl font-semibold mb-4">
          Create New Detection
        </h1>
      </header>

      <div className="detection-form-container">
        <DetectionForm
          onSubmit={handleSubmit}
          isLoading={loading}
          onValidationError={(errors) => {
            if (errors.length > 0) {
              Toast.error(errors[0].message);
            }
          }}
          className="w-full max-w-4xl mx-auto"
        />
      </div>

      {/* Error display for screen readers */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="sr-only"
        >
          {error}
        </div>
      )}

      {/* Loading indicator for screen readers */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          Creating detection...
        </div>
      )}
    </div>
  );
});

// Display name for debugging
CreateDetection.displayName = 'CreateDetection';

export default CreateDetection;