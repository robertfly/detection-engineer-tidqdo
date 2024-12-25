/**
 * @fileoverview Coverage Analysis page component providing comprehensive visualization
 * of security detection coverage mapped to the MITRE ATT&CK framework
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useParams } from 'react-router-dom';
import classNames from 'classnames';
import CoverageChart from '../../components/coverage/CoverageChart';
import CoverageMatrix from '../../components/coverage/CoverageMatrix';
import { useCoverage } from '../../hooks/useCoverage';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { Coverage } from '../../types/coverage';
import { useTheme } from '../../hooks/useTheme';

// Interface for selected technique with accessibility metadata
interface SelectedTechnique {
  id: string;
  name: string;
  coverage: number;
  detections: number;
  description: string;
  ariaLabel: string;
}

// Props interface for the Analysis component
interface AnalysisProps {
  className?: string;
}

/**
 * Coverage Analysis page component that provides comprehensive visualization
 * of security detection coverage with enhanced accessibility features
 */
const Analysis: React.FC<AnalysisProps> = memo(({ className }) => {
  // Get library ID from URL parameters
  const { libraryId } = useParams<{ libraryId: string }>();
  const { theme, isDarkMode } = useTheme();

  // Initialize coverage hook with error handling
  const {
    coverage,
    loading,
    error,
    analyzeLibrary,
    clearError
  } = useCoverage();

  // State for selected technique with accessibility metadata
  const [selectedTechnique, setSelectedTechnique] = useState<SelectedTechnique | null>(null);

  // Load coverage data on mount
  useEffect(() => {
    if (libraryId) {
      analyzeLibrary(libraryId);
    }
  }, [libraryId, analyzeLibrary]);

  // Handle technique selection with accessibility
  const handleTechniqueSelect = useCallback((technique: Coverage) => {
    const newSelection: SelectedTechnique = {
      id: technique.mitre_id,
      name: technique.name,
      coverage: technique.coverage_percentage,
      detections: technique.detection_count,
      description: technique.metadata?.description || '',
      ariaLabel: `Selected technique: ${technique.name} with ${technique.coverage_percentage}% coverage and ${technique.detection_count} detections`
    };

    setSelectedTechnique(newSelection);

    // Announce selection for screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = newSelection.ariaLabel;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, []);

  // Error handling with recovery options
  if (error) {
    return (
      <div 
        role="alert" 
        className="p-6 bg-error-50 dark:bg-error-900 text-error-700 dark:text-error-200 rounded-lg"
      >
        <h2 className="text-lg font-semibold mb-2">Coverage Analysis Error</h2>
        <p className="mb-4">{error.message}</p>
        <button
          onClick={clearError}
          className="px-4 py-2 bg-error-100 dark:bg-error-800 rounded-md hover:bg-error-200 dark:hover:bg-error-700 transition-colors"
          aria-label="Retry coverage analysis"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div 
        className={classNames(
          'container',
          'mx-auto',
          'px-4',
          'py-6',
          'space-y-6',
          className
        )}
      >
        {/* Page Header */}
        <header className="flex justify-between items-center">
          <h1 
            className="text-2xl font-bold text-gray-900 dark:text-gray-100"
            tabIndex={0}
          >
            Coverage Analysis
          </h1>
          <div className="flex items-center space-x-4">
            {/* Additional header controls can be added here */}
          </div>
        </header>

        {/* Loading State */}
        {loading.analyze && (
          <div 
            role="status" 
            aria-label="Loading coverage analysis"
            className="animate-pulse space-y-4"
          >
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        )}

        {/* Coverage Content */}
        {!loading.analyze && coverage && (
          <div className="space-y-6">
            {/* Coverage Overview Chart */}
            <section 
              aria-label="Coverage Overview Chart"
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
            >
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Coverage Overview
              </h2>
              <CoverageChart
                data={coverage}
                height={300}
                className="w-full"
                showAnimation={!isDarkMode}
              />
            </section>

            {/* Coverage Matrix and Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* MITRE ATT&CK Matrix */}
              <section 
                className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
                aria-label="MITRE ATT&CK Coverage Matrix"
              >
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  Technique Coverage
                </h2>
                <CoverageMatrix
                  libraryId={libraryId || ''}
                  onTechniqueSelect={handleTechniqueSelect}
                  className="w-full"
                  ariaLabel="MITRE ATT&CK coverage matrix showing detection coverage by technique"
                />
              </section>

              {/* Selected Technique Details */}
              <section 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6"
                aria-label="Selected Technique Details"
              >
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                  Technique Details
                </h2>
                {selectedTechnique ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        {selectedTechnique.name}
                      </h3>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedTechnique.id}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Coverage:</span>
                        <span className="font-medium">{selectedTechnique.coverage}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Detections:</span>
                        <span className="font-medium">{selectedTechnique.detections}</span>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300">
                      {selectedTechnique.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    Select a technique from the matrix to view details
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

// Display name for debugging
Analysis.displayName = 'Analysis';

export default Analysis;