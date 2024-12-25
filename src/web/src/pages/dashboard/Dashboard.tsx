/**
 * Main dashboard page component implementing Material Design 3.0 specifications
 * with enhanced accessibility and performance optimizations.
 * @version 1.0.0
 */

import React, { useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useErrorBoundary } from 'react-error-boundary';

// Internal components
import DashboardLayout from '../../layouts/DashboardLayout';
import CoverageChart from '../../components/coverage/CoverageChart';
import DetectionList from '../../components/detection/DetectionList';

// Hooks and utilities
import { useDetection } from '../../hooks/useDetection';
import { useTheme } from '../../hooks/useTheme';

// Types
import { Detection } from '../../types/detection';
import { Coverage } from '../../types/coverage';

export interface DashboardProps {
  /** Additional CSS classes */
  className?: string;
  /** Initial detection filters */
  initialFilters?: Record<string, unknown>;
}

/**
 * Dashboard component providing an overview of the detection engineering platform
 * with coverage metrics, recent detections, and key statistics.
 */
const Dashboard: React.FC<DashboardProps> = memo(({
  className = '',
  initialFilters = {}
}) => {
  // Hooks
  const navigate = useNavigate();
  const { showBoundary } = useErrorBoundary();
  const { theme, isDarkMode } = useTheme();
  
  const {
    detections,
    filteredDetections,
    loading,
    error,
    fetchDetections,
    createDetection,
    updateDetection,
    deleteDetection
  } = useDetection(initialFilters);

  // Fetch initial data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        await fetchDetections();
      } catch (error) {
        showBoundary(error);
      }
    };
    loadDashboardData();
  }, [fetchDetections, showBoundary]);

  // Handle detection click navigation
  const handleDetectionClick = useCallback((detection: Detection) => {
    navigate(`/detections/${detection.id}`);
  }, [navigate]);

  // Handle detection actions
  const handleDetectionEdit = useCallback((detection: Detection) => {
    navigate(`/detections/${detection.id}/edit`);
  }, [navigate]);

  const handleDetectionDelete = useCallback(async (detection: Detection) => {
    try {
      await deleteDetection(detection.id);
    } catch (error) {
      showBoundary(error);
    }
  }, [deleteDetection, showBoundary]);

  // Handle coverage chart interactions
  const handleTechniqueClick = useCallback((techniqueId: string) => {
    navigate(`/coverage/${techniqueId}`);
  }, [navigate]);

  return (
    <DashboardLayout
      className={`dashboard ${className}`}
      disableErrorBoundary={false}
    >
      <div className="grid gap-6 p-6">
        {/* Dashboard Header */}
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Detection Engineering Dashboard
          </h1>
        </header>

        {/* Coverage Overview Section */}
        <section 
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
          aria-labelledby="coverage-heading"
        >
          <h2 
            id="coverage-heading"
            className="text-xl font-medium text-gray-900 dark:text-white mb-4"
          >
            MITRE ATT&CK Coverage
          </h2>
          <div className="h-[400px]">
            <CoverageChart
              data={detections as unknown as Coverage[]}
              height={350}
              showAnimation={true}
              onTechniqueClick={handleTechniqueClick}
            />
          </div>
        </section>

        {/* Recent Detections Section */}
        <section 
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm"
          aria-labelledby="recent-detections-heading"
        >
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 
              id="recent-detections-heading"
              className="text-xl font-medium text-gray-900 dark:text-white"
            >
              Recent Detections
            </h2>
          </div>
          <DetectionList
            filters={{}}
            onDetectionClick={handleDetectionClick}
            onDetectionEdit={handleDetectionEdit}
            onDetectionDelete={handleDetectionDelete}
            onError={showBoundary}
            virtualizeList={true}
            className="h-[600px]"
            accessibilityLabel="Recent detection rules list"
            loadingMessage="Loading recent detections..."
            emptyMessage="No detection rules found"
          />
        </section>
      </div>
    </DashboardLayout>
  );
});

// Display name for debugging
Dashboard.displayName = 'Dashboard';

export default Dashboard;