/**
 * @fileoverview Comprehensive React form component for creating and editing security detections
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod'; // v3.22.0
import { useTheme } from '@mui/material'; // v5.14.0
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import Input from '../common/Input';
import Button from '../common/Button';
import DetectionEditor from './DetectionEditor';
import { validateDetection } from '../../utils/validation';
import type { Detection, DetectionCreate, DetectionUpdate } from '../../types/detection';

// Constants
const VALIDATION_DEBOUNCE = 500; // ms
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 200;
const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 2000;

// Form validation schema using Zod
const detectionFormSchema = z.object({
  name: z.string()
    .min(MIN_NAME_LENGTH, `Name must be at least ${MIN_NAME_LENGTH} characters`)
    .max(MAX_NAME_LENGTH, `Name cannot exceed ${MAX_NAME_LENGTH} characters`),
  description: z.string()
    .min(MIN_DESCRIPTION_LENGTH, `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`)
    .max(MAX_DESCRIPTION_LENGTH, `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`),
  platform: z.enum(['sigma', 'kql', 'spl', 'yara', 'chronicle']),
  logic: z.record(z.unknown()).refine(
    (logic) => Object.keys(logic).length > 0,
    "Detection logic cannot be empty"
  ),
  mitre_mapping: z.record(z.string(), z.array(z.string())),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  tags: z.array(z.string())
});

interface DetectionFormProps {
  /** Optional existing detection for editing mode */
  detection?: Detection;
  /** Async form submission handler */
  onSubmit: (detection: DetectionCreate | DetectionUpdate) => Promise<void>;
  /** Loading state indicator for form actions */
  isLoading?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** Validation error handler */
  onValidationError?: (errors: ValidationError[]) => void;
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * DetectionForm Component
 * 
 * A comprehensive form for creating and editing security detections with
 * real-time validation, MITRE ATT&CK mapping, and accessibility support.
 */
const DetectionForm: React.FC<DetectionFormProps> = React.memo(({
  detection,
  onSubmit,
  isLoading = false,
  className,
  onValidationError
}) => {
  // Theme and styles
  const theme = useTheme();

  // Form state
  const [formData, setFormData] = useState<Partial<Detection>>(() => ({
    name: detection?.name || '',
    description: detection?.description || '',
    platform: detection?.platform || 'sigma',
    logic: detection?.logic || {},
    mitre_mapping: detection?.mitre_mapping || {},
    severity: detection?.severity || 'medium',
    tags: detection?.tags || []
  }));

  // Validation state
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Memoized validation function
  const validateForm = useMemo(() => 
    debounce(async (data: Partial<Detection>) => {
      setIsValidating(true);
      try {
        // Schema validation
        const schemaResult = detectionFormSchema.safeParse(data);
        if (!schemaResult.success) {
          const validationErrors = schemaResult.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }));
          setErrors(validationErrors);
          onValidationError?.(validationErrors);
          return false;
        }

        // Detection-specific validation
        const detectionResult = await validateDetection(data);
        if (!detectionResult.isValid) {
          const validationErrors = detectionResult.errors.map(err => ({
            field: 'logic',
            message: err
          }));
          setErrors(validationErrors);
          onValidationError?.(validationErrors);
          return false;
        }

        setErrors([]);
        return true;
      } catch (error) {
        console.error('Validation error:', error);
        setErrors([{ field: 'form', message: 'Validation failed' }]);
        return false;
      } finally {
        setIsValidating(false);
      }
    }, VALIDATION_DEBOUNCE),
    [onValidationError]
  );

  // Handle form field changes
  const handleChange = useCallback((
    field: keyof Detection,
    value: any
  ) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      validateForm(updated);
      return updated;
    });
  }, [validateForm]);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const isValid = await validateForm(formData);
    if (!isValid) {
      return;
    }

    try {
      await onSubmit(formData as DetectionCreate | DetectionUpdate);
    } catch (error) {
      console.error('Form submission error:', error);
      setErrors([{ field: 'form', message: 'Failed to submit detection' }]);
    }
  };

  // Validate form on mount and detection changes
  useEffect(() => {
    if (detection) {
      validateForm(formData);
    }
  }, [detection, formData, validateForm]);

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      aria-label="Detection form"
      noValidate
    >
      <div className="form-grid">
        <Input
          id="detection-name"
          name="name"
          label="Detection Name"
          value={formData.name || ''}
          onChange={e => handleChange('name', e.target.value)}
          error={errors.find(e => e.field === 'name')?.message}
          required
          autoFocus
          disabled={isLoading}
          aria-describedby="name-error"
        />

        <Input
          id="detection-description"
          name="description"
          label="Description"
          value={formData.description || ''}
          onChange={e => handleChange('description', e.target.value)}
          error={errors.find(e => e.field === 'description')?.message}
          required
          multiline
          rows={4}
          disabled={isLoading}
          aria-describedby="description-error"
        />

        <DetectionEditor
          detection={formData as Detection}
          onChange={value => handleChange('logic', value)}
          readOnly={isLoading}
          onValidation={result => {
            if (!result.isValid) {
              setErrors(prev => [
                ...prev,
                { field: 'logic', message: 'Invalid detection logic' }
              ]);
            }
          }}
        />

        {/* Error summary for screen readers */}
        {errors.length > 0 && (
          <div
            role="alert"
            aria-live="polite"
            className="error-summary"
          >
            <h3>Please correct the following errors:</h3>
            <ul>
              {errors.map((error, index) => (
                <li key={index} id={`${error.field}-error`}>
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <Button
            type="submit"
            disabled={isLoading || isValidating || errors.length > 0}
            loading={isLoading}
            aria-label={detection ? 'Update detection' : 'Create detection'}
          >
            {detection ? 'Update Detection' : 'Create Detection'}
          </Button>
        </div>
      </div>
    </form>
  );
});

// Display name for debugging
DetectionForm.displayName = 'DetectionForm';

export default DetectionForm;