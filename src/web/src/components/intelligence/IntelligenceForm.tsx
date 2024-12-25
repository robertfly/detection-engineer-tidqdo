/**
 * @fileoverview Intelligence creation and editing form component
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form'; // v7.0.0
import * as yup from 'yup'; // v1.3.2

// Internal imports
import Input from '../common/Input';
import Select from '../common/Select';
import { useIntelligence } from '../../hooks/useIntelligence';
import { IntelligenceSourceType } from '../../types/intelligence';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_FILE_TYPES = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/gif'],
  text: ['text/plain', 'text/csv', 'application/json']
};

// Validation schema
const validationSchema = yup.object().shape({
  name: yup
    .string()
    .required('Name is required')
    .min(3, 'Name must be at least 3 characters')
    .max(200, 'Name cannot exceed 200 characters'),
  description: yup
    .string()
    .required('Description is required')
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
  source_type: yup
    .string()
    .oneOf(Object.values(IntelligenceSourceType), 'Invalid source type')
    .required('Source type is required'),
  source_url: yup
    .string()
    .url('Must be a valid URL')
    .nullable()
    .when('source_type', {
      is: 'url',
      then: yup.string().required('URL is required for URL source type')
    }),
  source_content: yup
    .mixed()
    .nullable()
    .when('source_type', {
      is: (type: string) => ['pdf', 'image', 'text'].includes(type),
      then: yup.mixed().required('File is required for selected source type')
    }),
  metadata: yup.object().default({})
});

// Props interface
interface IntelligenceFormProps {
  intelligence: Intelligence | null;
  onSubmit: (data: IntelligenceCreate) => Promise<void>;
  onCancel: () => void;
  onProgress: (progress: number) => void;
}

/**
 * Intelligence form component for creating and editing intelligence items
 * Implements comprehensive validation and accessibility features
 */
const IntelligenceForm: React.FC<IntelligenceFormProps> = React.memo(({
  intelligence,
  onSubmit,
  onCancel,
  onProgress
}) => {
  // Form handling with validation
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm({
    defaultValues: intelligence || {
      name: '',
      description: '',
      source_type: '',
      source_url: null,
      source_content: null,
      metadata: {}
    },
    resolver: yup.resolver(validationSchema)
  });

  // Custom hook for intelligence operations
  const { loading, error, progress } = useIntelligence();

  // Watch source type for conditional rendering
  const sourceType = watch('source_type');

  // Memoized source type options
  const sourceTypeOptions = useMemo(() => [
    { value: 'pdf', label: 'PDF Document' },
    { value: 'url', label: 'URL' },
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'structured_data', label: 'Structured Data' }
  ], []);

  // Handle file upload with validation
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setValue('source_content', null);
      return;
    }

    // Validate file type
    const fileType = sourceType.toLowerCase();
    if (SUPPORTED_FILE_TYPES[fileType] && !SUPPORTED_FILE_TYPES[fileType].includes(file.type)) {
      setValue('source_content', null);
      return;
    }

    setValue('source_content', file);
  }, [sourceType, setValue]);

  // Update progress
  useEffect(() => {
    onProgress(progress);
  }, [progress, onProgress]);

  // Form submission handler
  const handleFormSubmit = useCallback(async (data: IntelligenceCreate) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  }, [onSubmit]);

  return (
    <form 
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-6"
      noValidate
    >
      <Input
        id="name"
        label="Intelligence Name"
        type="text"
        error={errors.name?.message}
        required
        {...register('name')}
        aria-describedby="name-error"
      />

      <Input
        id="description"
        label="Description"
        type="textarea"
        error={errors.description?.message}
        required
        {...register('description')}
        aria-describedby="description-error"
      />

      <Select
        id="source_type"
        label="Source Type"
        options={sourceTypeOptions}
        value={sourceType}
        error={errors.source_type?.message}
        required
        onChange={(value) => setValue('source_type', value)}
        aria-describedby="source-type-error"
      />

      {sourceType === 'url' && (
        <Input
          id="source_url"
          label="Source URL"
          type="url"
          error={errors.source_url?.message}
          required
          {...register('source_url')}
          aria-describedby="source-url-error"
        />
      )}

      {['pdf', 'image', 'text'].includes(sourceType) && (
        <Input
          id="source_content"
          label="Upload File"
          type="file"
          accept={SUPPORTED_FILE_TYPES[sourceType].join(',')}
          error={errors.source_content?.message}
          required
          onChange={handleFileUpload}
          aria-describedby="source-content-error"
        />
      )}

      {error && (
        <div 
          className="text-error-500 text-sm"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || loading}
        >
          {isSubmitting || loading ? 'Processing...' : 'Submit'}
        </button>
      </div>

      {(isSubmitting || loading) && (
        <div 
          className="text-sm text-gray-500"
          aria-live="polite"
        >
          Processing... {progress}% complete
        </div>
      )}
    </form>
  );
});

IntelligenceForm.displayName = 'IntelligenceForm';

export default IntelligenceForm;