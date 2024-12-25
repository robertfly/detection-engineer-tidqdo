import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { debounce } from 'lodash'; // v4.17.21
import MitreHeatmap, { MitreHeatmapProps } from '../../components/coverage/MitreHeatmap';
import CoverageMatrix, { CoverageMatrixProps } from '../../components/coverage/CoverageMatrix';
import useCoverage from '../../hooks/useCoverage';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// View type enum for visualization options
enum ViewType {
  HEATMAP = 'heatmap',
  MATRIX = 'matrix'
}

// Constants
const DEBOUNCE_DELAY = 150;
const VIRTUALIZATION_CONFIG = {
  itemSize: 50,
  overscanCount: 5
};

/**
 * MatrixPage component that renders the MITRE ATT&CK coverage visualization
 * with support for both heatmap and matrix views.
 */
const MatrixPage: React.FC = () => {
  // Router hooks
  const { libraryId } = useParams<{ libraryId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // State management
  const [viewType, setViewType] = useState<ViewType>(() => {
    const savedView = localStorage.getItem('preferred-coverage-view');
    return (savedView as ViewType) || ViewType.HEATMAP;
  });
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string | null>(null);

  // Coverage data management
  const { coverage, loading, error, analyzeLibrary } = useCoverage();

  // Load coverage data on mount
  useEffect(() => {
    if (libraryId) {
      analyzeLibrary(libraryId);
    }
  }, [libraryId, analyzeLibrary]);

  // Save view preference
  useEffect(() => {
    localStorage.setItem('preferred-coverage-view', viewType);
  }, [viewType]);

  // Handle technique selection with debouncing
  const handleTechniqueSelect = useMemo(
    () =>
      debounce((techniqueId: string) => {
        setSelectedTechniqueId(techniqueId);
        navigate(`/coverage/${libraryId}/technique/${techniqueId}`, {
          state: { from: location.pathname }
        });
      }, DEBOUNCE_DELAY),
    [libraryId, navigate, location.pathname]
  );

  // Toggle view type handler
  const handleViewToggle = useCallback(() => {
    setViewType(prev => prev === ViewType.HEATMAP ? ViewType.MATRIX : ViewType.HEATMAP);
  }, []);

  // Render loading state
  if (loading.analyze) {
    return (
      <div 
        role="status" 
        className="flex items-center justify-center min-h-screen"
        aria-label="Loading coverage visualization"
      >
        <div className="animate-pulse">
          <div className="h-96 w-96 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div 
        role="alert" 
        className="p-4 text-error-500 bg-error-50 dark:bg-error-900 rounded-lg"
      >
        <h2 className="text-lg font-semibold mb-2">Error Loading Coverage Data</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="coverage-matrix-page p-4 space-y-4">
        {/* Header Section */}
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Coverage Analysis
          </h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleViewToggle}
              className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              aria-label={`Switch to ${viewType === ViewType.HEATMAP ? 'matrix' : 'heatmap'} view`}
            >
              {viewType === ViewType.HEATMAP ? 'Switch to Matrix' : 'Switch to Heatmap'}
            </button>
          </div>
        </header>

        {/* Visualization Section */}
        <main className="relative min-h-[600px]">
          {viewType === ViewType.HEATMAP ? (
            <MitreHeatmap
              onTechniqueClick={handleTechniqueSelect}
              className="w-full h-full"
              reducedMotion={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
              ariaLabel="MITRE ATT&CK Coverage Heatmap"
              theme={document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'light'}
            />
          ) : (
            <CoverageMatrix
              libraryId={libraryId!}
              onTechniqueSelect={handleTechniqueSelect}
              className="w-full h-full"
              ariaLabel="MITRE ATT&CK Coverage Matrix"
            />
          )}
        </main>

        {/* Selected Technique Details */}
        {selectedTechniqueId && coverage && (
          <aside
            className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-lg p-4 transform transition-transform"
            role="complementary"
            aria-label="Selected technique details"
          >
            {/* Technique details implementation */}
          </aside>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default MatrixPage;