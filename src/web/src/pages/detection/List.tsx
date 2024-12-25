/**
 * Enhanced detection list page component implementing Material Design 3.0
 * specifications with virtualization, accessibility, and performance optimizations.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import DetectionList from '../../components/detection/DetectionList';
import { useDetection } from '../../hooks/useDetection';
import { Detection } from '../../types/detection';
import Toast from '../../components/common/Toast';

// Constants for performance optimization
const SEARCH_DEBOUNCE_MS = 300;
const ITEMS_PER_PAGE = 20;

/**
 * Props interface for DetectionListPage component
 */
interface DetectionListPageProps {
  className?: string;
}

/**
 * Enhanced detection list page component with comprehensive filtering,
 * virtualization, and accessibility features.
 */
const DetectionListPage: React.FC<DetectionListPageProps> = ({ className }) => {
  // Hooks for navigation and URL parameters
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State management
  const [filters, setFilters] = useState(() => ({
    status: searchParams.getAll('status'),
    platform: searchParams.getAll('platform'),
    library_id: searchParams.get('library'),
    search: searchParams.get('search') || '',
    mitreTactics: searchParams.getAll('tactics'),
    mitreTechniques: searchParams.getAll('techniques'),
    tags: searchParams.getAll('tags'),
    author: searchParams.get('author')
  }));

  // Detection management hook
  const {
    detections,
    filteredDetections,
    loading,
    error,
    fetchDetections,
    deleteDetection,
    updateDetection
  } = useDetection(filters);

  // Memoized filter handlers
  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    
    // Update URL parameters
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else if (value) {
        params.set(key, value);
      }
    });
    setSearchParams(params);
  }, [setSearchParams]);

  // Debounced search handler
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      handleFilterChange({ ...filters, search: query });
    }, SEARCH_DEBOUNCE_MS),
    [filters, handleFilterChange]
  );

  // Navigation handlers
  const handleDetectionClick = useCallback((detection: Detection) => {
    navigate(`/detections/${detection.id}`);
  }, [navigate]);

  const handleDetectionEdit = useCallback((detection: Detection) => {
    navigate(`/detections/${detection.id}/edit`);
  }, [navigate]);

  // Delete handler with optimistic updates
  const handleDetectionDelete = useCallback(async (detection: Detection) => {
    try {
      await deleteDetection(detection.id);
      <Toast
        id={`delete-success-${detection.id}`}
        message="Detection successfully deleted"
        variant="success"
        duration={3000}
      />;
    } catch (error) {
      console.error('Failed to delete detection:', error);
      <Toast
        id={`delete-error-${detection.id}`}
        message="Failed to delete detection"
        variant="error"
        duration={5000}
      />;
    }
  }, [deleteDetection]);

  // Error handler
  const handleError = useCallback((error: Error) => {
    console.error('Detection list error:', error);
    <Toast
      id={`list-error-${Date.now()}`}
      message="An error occurred while loading detections"
      variant="error"
      duration={5000}
    />;
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchDetections(filters).catch(handleError);
  }, [fetchDetections, filters, handleError]);

  return (
    <DashboardLayout>
      <div className={`detection-list-page ${className || ''}`}>
        <DetectionList
          filters={filters}
          onDetectionClick={handleDetectionClick}
          onDetectionEdit={handleDetectionEdit}
          onDetectionDelete={handleDetectionDelete}
          onError={handleError}
          virtualizeList={true}
          accessibilityLabel="Detection rules list"
          loadingMessage="Loading detection rules..."
          emptyMessage="No detection rules found"
          className="h-full"
        />
      </div>
    </DashboardLayout>
  );
};

// Display name for debugging
DetectionListPage.displayName = 'DetectionListPage';

export default DetectionListPage;