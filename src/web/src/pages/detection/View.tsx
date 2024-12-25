import React, { useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalytics } from '@datadog/browser-rum';

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import DetectionPreview from '../../components/detection/DetectionPreview';
import { useDetection } from '../../hooks/useDetection';
import ErrorBoundary from '../../components/common/ErrorBoundary';

/**
 * Props interface for DetectionView component
 */
interface DetectionViewProps {
  id?: string;
}

/**
 * DetectionView component displays detailed view of a security detection rule
 * Implements Material Design 3.0 specifications with enhanced accessibility
 */
const DetectionView: React.FC<DetectionViewProps> = ({ id: propId }) => {
  // Hooks
  const { id: urlId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addAction } = useAnalytics();
  
  const {
    selectedDetection,
    loading,
    error,
    fetchDetections,
    deleteDetection,
    validateDetection
  } = useDetection();

  // Use ID from props or URL
  const detectionId = propId || urlId;

  /**
   * Fetches detection data with error handling
   */
  useEffect(() => {
    if (detectionId) {
      fetchDetections({ id: detectionId }).catch((error) => {
        console.error('Failed to fetch detection:', error);
      });
    }
  }, [detectionId, fetchDetections]);

  /**
   * Handles edit action with analytics tracking
   */
  const handleEdit = useCallback(async () => {
    if (!selectedDetection) return;

    try {
      addAction('edit_detection', {
        detection_id: selectedDetection.id,
        platform: selectedDetection.platform
      });

      navigate(`/detections/${selectedDetection.id}/edit`, {
        state: { detection: selectedDetection }
      });
    } catch (error) {
      console.error('Edit navigation failed:', error);
    }
  }, [selectedDetection, navigate, addAction]);

  /**
   * Handles delete action with confirmation and analytics
   */
  const handleDelete = useCallback(async () => {
    if (!selectedDetection) return;

    try {
      const confirmed = window.confirm(
        'Are you sure you want to delete this detection? This action cannot be undone.'
      );

      if (confirmed) {
        addAction('delete_detection', {
          detection_id: selectedDetection.id,
          platform: selectedDetection.platform
        });

        await deleteDetection(selectedDetection.id);
        navigate('/detections', { replace: true });
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [selectedDetection, deleteDetection, navigate, addAction]);

  /**
   * Handles view action with analytics tracking
   */
  const handleView = useCallback(async () => {
    if (!selectedDetection) return;

    addAction('view_detection_details', {
      detection_id: selectedDetection.id,
      platform: selectedDetection.platform
    });
  }, [selectedDetection, addAction]);

  /**
   * Memoized breadcrumb configuration
   */
  const breadcrumbs = useMemo(() => [
    { label: 'Detections', href: '/detections' },
    { label: selectedDetection?.name || 'Loading...', href: '#' }
  ], [selectedDetection]);

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Detection Details
            </h1>
            <nav className="mt-2">
              <ol className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                {breadcrumbs.map((item, index) => (
                  <React.Fragment key={item.href}>
                    {index > 0 && <span>/</span>}
                    <li>
                      <a 
                        href={item.href}
                        className="hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {item.label}
                      </a>
                    </li>
                  </React.Fragment>
                ))}
              </ol>
            </nav>
          </div>

          {loading ? (
            <div className="animate-pulse">
              <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
              <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
          ) : error ? (
            <div 
              className="bg-error-50 dark:bg-error-900 text-error-700 dark:text-error-200 p-4 rounded-lg"
              role="alert"
            >
              <h2 className="text-lg font-semibold mb-2">Error Loading Detection</h2>
              <p>{error.message}</p>
            </div>
          ) : selectedDetection ? (
            <DetectionPreview
              detection={selectedDetection}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              className="bg-white dark:bg-gray-800 shadow-lg rounded-lg"
              elevation={2}
              isInteractive={true}
            />
          ) : (
            <div 
              className="text-gray-500 dark:text-gray-400 text-center p-8"
              role="status"
            >
              No detection found
            </div>
          )}
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
};

// Display name for debugging
DetectionView.displayName = 'DetectionView';

export default DetectionView;