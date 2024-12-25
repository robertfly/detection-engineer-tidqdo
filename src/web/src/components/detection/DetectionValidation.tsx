/**
 * @fileoverview Detection validation component with real-time feedback and accessibility
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Typography, Button, CircularProgress, Box } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce'; // v4.17.21

// Internal imports
import { Detection } from '../../types/detection';
import { validateDetection } from '../../services/api/detection';
import ProgressBar from '../common/ProgressBar';
import { ERROR_CODES } from '../../config/constants';

// Performance monitoring constants
const VALIDATION_TIMEOUT = 5000; // 5 seconds as per requirements
const PROGRESS_UPDATE_INTERVAL = 100; // 100ms for smooth progress updates
const WARNING_THRESHOLD = 3; // Number of warnings before changing status

interface DetectionValidationProps {
  /** Detection object to validate */
  detection: Detection;
  /** Callback function when validation completes */
  onValidationComplete: (results: ValidationResults) => void;
  /** Optional className for styling */
  className?: string;
  /** Accessibility label */
  'aria-label'?: string;
}

interface ValidationState {
  isValidating: boolean;
  progress: number;
  results: ValidationResults | null;
  error: ValidationError | null;
  startTime: number | null;
  endTime: number | null;
}

interface ValidationResults {
  status: 'success' | 'warning' | 'error';
  errors: ValidationError[];
  warnings: ValidationWarning[];
  performance: ValidationPerformance;
}

interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  location: string | null;
}

interface ValidationPerformance {
  duration: number;
  rulesChecked: number;
  testsExecuted: number;
}

/**
 * DetectionValidation Component
 * 
 * Provides real-time validation feedback for security detection rules with
 * enhanced accessibility, performance monitoring, and comprehensive error handling.
 */
export const DetectionValidation: React.FC<DetectionValidationProps> = ({
  detection,
  onValidationComplete,
  className,
  'aria-label': ariaLabel,
}) => {
  // State management
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    progress: 0,
    results: null,
    error: null,
    startTime: null,
    endTime: null,
  });

  // Refs for cleanup and performance tracking
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Query client for cache management
  const queryClient = useQueryClient();

  /**
   * Determines validation status and semantic variant based on results
   */
  const getValidationStatus = useCallback((results: ValidationResults): 'success' | 'warning' | 'error' => {
    if (results.errors.some(error => error.severity === 'error')) {
      return 'error';
    }
    if (results.warnings.length > WARNING_THRESHOLD) {
      return 'warning';
    }
    return 'success';
  }, []);

  /**
   * Updates progress with debounced updates to prevent UI thrashing
   */
  const updateProgress = debounce((newProgress: number) => {
    setValidationState(prev => ({
      ...prev,
      progress: Math.min(newProgress, 100)
    }));
  }, PROGRESS_UPDATE_INTERVAL);

  /**
   * Handles the validation process with progress tracking
   */
  const handleValidation = useCallback(async () => {
    try {
      // Cleanup previous validation if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      // Initialize new validation
      abortControllerRef.current = new AbortController();
      const startTime = Date.now();

      setValidationState({
        isValidating: true,
        progress: 0,
        results: null,
        error: null,
        startTime,
        endTime: null,
      });

      // Start validation with progress tracking
      const results = await validateDetection(detection.id);
      const endTime = Date.now();

      // Calculate performance metrics
      const performance = {
        duration: endTime - startTime,
        rulesChecked: results.rulesChecked || 0,
        testsExecuted: results.testsExecuted || 0,
      };

      // Update results with status and performance data
      const finalResults: ValidationResults = {
        ...results,
        status: getValidationStatus(results),
        performance,
      };

      // Update state and trigger callback
      setValidationState(prev => ({
        ...prev,
        isValidating: false,
        progress: 100,
        results: finalResults,
        endTime,
      }));

      onValidationComplete(finalResults);

      // Update cache
      queryClient.setQueryData(
        ['validation', detection.id],
        finalResults
      );

      // Announce completion to screen readers
      const statusMessage = `Validation ${finalResults.status}. ${
        finalResults.errors.length
      } errors and ${finalResults.warnings.length} warnings found.`;
      
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.textContent = statusMessage;
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);

    } catch (error) {
      console.error('Validation error:', error);
      setValidationState(prev => ({
        ...prev,
        isValidating: false,
        error: {
          code: ERROR_CODES.DETECTION.VALIDATION_FAILED,
          message: 'Validation failed',
          severity: 'error',
          location: null,
        },
      }));
    }
  }, [detection.id, getValidationStatus, onValidationComplete, queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return (
    <Card 
      className={className}
      aria-label={ariaLabel || 'Detection validation'}
      role="region"
    >
      <Box p={2}>
        <Typography variant="h6" gutterBottom>
          Validation Status
        </Typography>

        <ProgressBar
          value={validationState.progress}
          variant={validationState.results?.status}
          aria-label="Validation progress"
          size="medium"
        />

        {validationState.error && (
          <Typography 
            color="error" 
            variant="body2" 
            role="alert"
            mt={1}
          >
            {validationState.error.message}
          </Typography>
        )}

        <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleValidation}
            disabled={validationState.isValidating}
            startIcon={validationState.isValidating ? <CircularProgress size={20} /> : null}
          >
            {validationState.isValidating ? 'Validating...' : 'Validate Detection'}
          </Button>

          {validationState.results && (
            <Typography variant="body2" color="textSecondary">
              Completed in {validationState.results.performance.duration}ms
            </Typography>
          )}
        </Box>
      </Box>
    </Card>
  );
};

export default DetectionValidation;