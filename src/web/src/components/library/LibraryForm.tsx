/**
 * LibraryForm.tsx
 * A comprehensive React form component for creating and editing detection libraries
 * with advanced validation, accessibility features, and security controls.
 * Version: 1.0.0
 */

import React, { useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form'; // v7.45.0
import { z } from 'zod'; // v3.22.0
import { useAnalytics } from '@analytics/react'; // v0.1.0

// Internal imports
import Input from '../common/Input';
import Select from '../common/Select';
import ErrorBoundary from '../common/ErrorBoundary';
import {
  CreateLibraryDto,
  UpdateLibraryDto,
  Library,
  LibraryVisibility,
  LibrarySettings,
  validateLibraryDto
} from '../../types/library';

// Constants for form configuration
const VISIBILITY_OPTIONS = [
  {
    label: 'Private',
    value: 'private',
    description: 'Only visible to creator'
  },
  {
    label: 'Organization',
    value: 'organization',
    description: 'Visible to organization members'
  },
  {
    label: 'Public',
    value: 'public',
    description: 'Visible to all users'
  }
] as const;

const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = {
  allowContributions: false,
  requireApproval: true,
  autoTranslate: false,
  enableVersioning: true,
  allowComments: true,
  contributorRoles: [],
  approverRoles: []
};

const FORM_ANALYTICS_EVENTS = {
  FORM_SUBMIT: 'library_form_submit',
  FORM_ERROR: 'library_form_error',
  FORM_SUCCESS: 'library_form_success'
} as const;

// Zod schema for form validation
const formSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters'),
  visibility: z.enum(['private', 'organization', 'public']),
  settings: z.object({
    allowContributions: z.boolean(),
    requireApproval: z.boolean(),
    autoTranslate: z.boolean()
  }).partial()
});

// Props interface
export interface LibraryFormProps {
  library?: Library;
  onSubmit: (data: CreateLibraryDto | UpdateLibraryDto) => Promise<void>;
  isLoading?: boolean;
  autoSave?: boolean;
  onCancel?: () => void;
  className?: string;
}

/**
 * LibraryForm component for creating and editing detection libraries
 * with comprehensive validation and accessibility features.
 */
const LibraryForm: React.FC<LibraryFormProps> = ({
  library,
  onSubmit,
  isLoading = false,
  autoSave = false,
  onCancel,
  className
}) => {
  // Analytics hook
  const analytics = useAnalytics();

  // Form initialization with react-hook-form
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch
  } = useForm({
    defaultValues: {
      name: library?.name || '',
      description: library?.description || '',
      visibility: library?.visibility || 'private' as LibraryVisibility,
      settings: library?.settings || DEFAULT_LIBRARY_SETTINGS
    }
  });

  // Watch form values for auto-save
  const formValues = watch();

  // Auto-save handler
  useEffect(() => {
    if (autoSave && isDirty && !isLoading) {
      const timeoutId = setTimeout(() => {
        handleFormSubmit(formValues);
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [formValues, autoSave, isDirty, isLoading]);

  // Form submission handler
  const handleFormSubmit = useCallback(async (data: any) => {
    try {
      // Track submission attempt
      analytics.track(FORM_ANALYTICS_EVENTS.FORM_SUBMIT);

      // Validate form data
      const validationErrors = validateLibraryDto(data, !!library);
      if (validationErrors.length > 0) {
        analytics.track(FORM_ANALYTICS_EVENTS.FORM_ERROR, { errors: validationErrors });
        return;
      }

      // Prepare submission data
      const submissionData = {
        ...data,
        version: library?.version
      };

      // Submit form
      await onSubmit(submissionData);
      
      // Track success
      analytics.track(FORM_ANALYTICS_EVENTS.FORM_SUCCESS);

      // Reset form if creating new library
      if (!library) {
        reset();
      }
    } catch (error) {
      console.error('Form submission error:', error);
      analytics.track(FORM_ANALYTICS_EVENTS.FORM_ERROR, { error });
    }
  }, [library, onSubmit, reset, analytics]);

  return (
    <ErrorBoundary>
      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className={className}
        noValidate
      >
        <div className="space-y-6">
          {/* Name field */}
          <Controller
            name="name"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Input
                {...field}
                id="library-name"
                label="Library Name"
                error={errors.name?.message}
                required
                autoFocus
                disabled={isLoading}
                aria-describedby="library-name-description"
              />
            )}
          />

          {/* Description field */}
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="library-description"
                label="Description"
                error={errors.description?.message}
                disabled={isLoading}
                aria-describedby="library-description-help"
              />
            )}
          />

          {/* Visibility selection */}
          <Controller
            name="visibility"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Select
                {...field}
                id="library-visibility"
                label="Visibility"
                options={VISIBILITY_OPTIONS}
                error={errors.visibility?.message}
                required
                disabled={isLoading}
                aria-describedby="library-visibility-help"
              />
            )}
          />

          {/* Settings section */}
          <fieldset className="space-y-4">
            <legend className="text-lg font-medium">Library Settings</legend>
            
            <Controller
              name="settings.allowContributions"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="checkbox"
                  id="allow-contributions"
                  label="Allow Contributions"
                  disabled={isLoading}
                />
              )}
            />

            <Controller
              name="settings.requireApproval"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="checkbox"
                  id="require-approval"
                  label="Require Approval"
                  disabled={isLoading}
                />
              )}
            />

            <Controller
              name="settings.autoTranslate"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  type="checkbox"
                  id="auto-translate"
                  label="Auto-translate Detections"
                  disabled={isLoading}
                />
              )}
            />
          </fieldset>

          {/* Form actions */}
          <div className="flex justify-end space-x-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            )}
            
            <button
              type="submit"
              disabled={isLoading || (!isDirty && !autoSave)}
              className="btn btn-primary"
            >
              {isLoading ? 'Saving...' : library ? 'Update Library' : 'Create Library'}
            </button>
          </div>
        </div>
      </form>
    </ErrorBoundary>
  );
};

export default LibraryForm;