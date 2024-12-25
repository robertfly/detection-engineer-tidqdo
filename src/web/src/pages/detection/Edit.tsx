/**
 * @fileoverview Edit page component for modifying existing security detections
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useMetrics } from '@datadog/browser-rum';

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import DetectionForm from '../../components/detection/DetectionForm';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useDetection } from '../../hooks/useDetection';
import type { Detection, DetectionUpdate } from '../../types/detection';

// Performance monitoring constants
const PERFORMANCE_THRESHOLD = 1000; // 1 second

/**
 * Edit detection page component with enhanced error handling and accessibility
 */
const EditDetection: React.FC = () => {
  // Hooks
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addTiming } = useMetrics();
  const { 
    selectedDetection,
    updateDetection,
    loading,
    error 
  } = useDetection();

  // Local state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  /**
   * Handles detection update with comprehensive error handling
   */
  const handleUpdateDetection = useCallback(async (updatedDetection: DetectionUpdate) => {
    const startTime = performance.now();

    try {
      if (!id) {
        throw new Error('Detection ID is required');
      }

      await updateDetection(id, updatedDetection);

      // Track performance
      const duration = performance.now() - startTime;
      addTiming('detection_update', duration);

      if (duration > PERFORMANCE_THRESHOLD) {
        console.warn('Detection update exceeded performance threshold', {
          duration,
          threshold: PERFORMANCE_THRESHOLD
        });
      }

      // Show success notification
      toast.success('Detection updated successfully', {
        duration: 5000,
        ariaProps: {
          role: 'status',
          'aria-live': 'polite'
        }
      });

      // Navigate back to detection view
      navigate(`/detections/${id}`);

    } catch (error) {
      console.error('Failed to update detection:', error);
      
      // Show error notification
      toast.error('Failed to update detection. Please try again.', {
        duration: 0,
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive'
        }
      });

      // Set validation errors if available
      if (error instanceof Error) {
        setValidationErrors([error.message]);
      }
    }
  }, [id, updateDetection, navigate, addTiming]);

  /**
   * Handles validation errors from the form
   */
  const handleValidationError = useCallback((errors: string[]) => {
    setValidationErrors(errors);
  }, []);

  // Fetch detection on mount
  useEffect(() => {
    if (id && !selectedDetection) {
      // Implementation would go here if needed
      // Current hook implementation handles this automatically
    }
  }, [id, selectedDetection]);

  // Show loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div 
          className="flex items-center justify-center h-full"
          role="status"
          aria-label="Loading detection"
        >
          <div className="animate-pulse">Loading detection...</div>
        </div>
      </DashboardLayout>
    );
  }

  // Show error state
  if (error) {
    return (
      <DashboardLayout>
        <div 
          className="text-red-500 p-4"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      </DashboardLayout>
    );
  }

  // Show not found state
  if (!selectedDetection) {
    return (
      <DashboardLayout>
        <div 
          className="text-gray-500 p-4"
          role="alert"
          aria-live="assertive"
        >
          Detection not found
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">
          Edit Detection
        </h1>

        <ErrorBoundary>
          <DetectionForm
            detection={selectedDetection}
            onSubmit={handleUpdateDetection}
            onValidationError={handleValidationError}
            isLoading={loading}
            className="max-w-4xl"
          />
        </ErrorBoundary>

        {/* Validation error summary for screen readers */}
        {validationErrors.length > 0 && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-4 p-4 bg-red-50 text-red-700 rounded"
          >
            <h2 className="font-semibold">Please correct the following errors:</h2>
            <ul className="list-disc pl-4 mt-2">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EditDetection;