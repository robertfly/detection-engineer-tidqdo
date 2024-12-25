/**
 * Create.tsx
 * Page component for creating new detection libraries with enhanced security controls,
 * accessibility features, and real-time validation.
 * Version: 1.0.0
 */

import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import debounce from 'lodash/debounce';

// Internal imports
import LibraryForm from '../../components/library/LibraryForm';
import Card from '../../components/common/Card';
import { createNewLibrary } from '../../store/library/actions';
import { CreateLibraryDto, validateLibraryDto } from '../../types/library';
import { RootState } from '../../store/types';

// Constants
const PAGE_TITLE = 'Create Detection Library';
const PAGE_DESCRIPTION = 'Create a new library to organize and manage your detection rules';
const VALIDATION_DEBOUNCE = 500;

/**
 * Page component for creating new detection libraries with enhanced security
 * and accessibility features.
 */
const CreateLibraryPage: React.FC = () => {
  // Redux hooks
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Get loading and error states from Redux store
  const { loading, error } = useSelector((state: RootState) => state.library);

  // Set up page title and metadata
  useEffect(() => {
    document.title = PAGE_TITLE;
    // Add metadata description for SEO
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', PAGE_DESCRIPTION);
    }
  }, []);

  // Debounced validation function
  const validateLibraryData = debounce((data: CreateLibraryDto) => {
    const validationErrors = validateLibraryDto(data, false);
    return validationErrors.length === 0;
  }, VALIDATION_DEBOUNCE);

  /**
   * Handles library creation with enhanced security and validation
   * @param formData - Library creation data from form
   */
  const handleCreateLibrary = useCallback(async (formData: CreateLibraryDto) => {
    try {
      // Validate CSRF token
      const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if (!csrfToken) {
        throw new Error('CSRF token not found');
      }

      // Validate form data
      const isValid = await validateLibraryData(formData);
      if (!isValid) {
        throw new Error('Invalid library data');
      }

      // Dispatch creation action
      await dispatch(createNewLibrary(formData));

      // Navigate to libraries list on success
      navigate('/libraries', { 
        replace: true,
        state: { message: 'Library created successfully' }
      });

    } catch (error) {
      console.error('Library creation error:', error);
      // Error handling is managed by the Redux action
    }
  }, [dispatch, navigate, validateLibraryData]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Accessible page header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {PAGE_TITLE}
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          {PAGE_DESCRIPTION}
        </p>
      </header>

      {/* Main content */}
      <main>
        <Card
          elevation={1}
          className="max-w-2xl mx-auto"
          aria-label="Library creation form"
        >
          <LibraryForm
            onSubmit={handleCreateLibrary}
            isLoading={loading}
            autoSave={false}
            className="space-y-6"
          />
        </Card>
      </main>

      {/* Error feedback */}
      {error && (
        <div
          role="alert"
          className="mt-4 p-4 bg-error-50 text-error-700 rounded-md"
          aria-live="polite"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default CreateLibraryPage;