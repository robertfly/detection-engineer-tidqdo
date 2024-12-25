/**
 * @fileoverview Intelligence Processing Page Component
 * Implements comprehensive intelligence source processing with enhanced performance monitoring
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { debounce } from 'lodash'; // v4.17.21

// Internal components
import IntelligenceUpload from '../../components/intelligence/IntelligenceUpload';
import IntelligencePreview from '../../components/intelligence/IntelligencePreview';

// Custom hooks and utilities
import { useIntelligence } from '../../hooks/useIntelligence';

// Performance monitoring constants
const PERFORMANCE_THRESHOLDS = {
  RENDER_TIME: 100,
  UPLOAD_TIME: 2000,
  REFRESH_DEBOUNCE: 500
};

/**
 * Intelligence Processing Page Component
 * Provides interface for uploading and processing intelligence sources
 * with enhanced performance monitoring and accessibility features
 */
const ProcessPage: React.FC = () => {
  // Intelligence state management with performance metrics
  const {
    items,
    loading,
    error,
    refresh,
    metrics
  } = useIntelligence({ autoFetch: true });

  // Local state for performance tracking
  const [renderStartTime] = useState(performance.now());
  const [processingMetrics, setProcessingMetrics] = useState({
    uploadCount: 0,
    successCount: 0,
    failureCount: 0,
    averageProcessingTime: 0
  });

  // Debounced refresh to prevent excessive updates
  const debouncedRefresh = useCallback(
    debounce(() => {
      refresh();
    }, PERFORMANCE_THRESHOLDS.REFRESH_DEBOUNCE),
    [refresh]
  );

  /**
   * Handles successful intelligence upload with performance tracking
   */
  const handleUploadComplete = useCallback(() => {
    const uploadTime = performance.now() - renderStartTime;
    
    setProcessingMetrics(prev => {
      const newSuccessCount = prev.successCount + 1;
      const newTotalTime = (prev.averageProcessingTime * prev.successCount) + uploadTime;
      
      return {
        uploadCount: prev.uploadCount + 1,
        successCount: newSuccessCount,
        failureCount: prev.failureCount,
        averageProcessingTime: newTotalTime / newSuccessCount
      };
    });

    // Log performance metrics if threshold exceeded
    if (uploadTime > PERFORMANCE_THRESHOLDS.UPLOAD_TIME) {
      console.warn('Intelligence upload exceeded time threshold:', {
        duration: uploadTime,
        threshold: PERFORMANCE_THRESHOLDS.UPLOAD_TIME
      });
    }

    debouncedRefresh();
  }, [debouncedRefresh, renderStartTime]);

  /**
   * Handles upload errors with retry mechanism
   */
  const handleUploadError = useCallback((error: Error) => {
    setProcessingMetrics(prev => ({
      ...prev,
      uploadCount: prev.uploadCount + 1,
      failureCount: prev.failureCount + 1
    }));

    console.error('Intelligence upload error:', {
      error,
      metrics: processingMetrics
    });
  }, [processingMetrics]);

  // Monitor component render performance
  useEffect(() => {
    const renderTime = performance.now() - renderStartTime;
    if (renderTime > PERFORMANCE_THRESHOLDS.RENDER_TIME) {
      console.warn('Intelligence page render exceeded threshold:', {
        duration: renderTime,
        threshold: PERFORMANCE_THRESHOLDS.RENDER_TIME
      });
    }
  }, [renderStartTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedRefresh.cancel();
    };
  }, [debouncedRefresh]);

  return (
    <div className="container">
      {/* Upload Section */}
      <section 
        className="uploadSection"
        aria-label="Intelligence Upload"
      >
        <h1 className="text-2xl font-bold mb-4">
          Process Intelligence
        </h1>
        
        <IntelligenceUpload
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          allowedTypes={['pdf', 'url', 'image', 'text', 'structured_data']}
          maxFileSize={50 * 1024 * 1024} // 50MB
          processingTimeout={120000} // 2 minutes
        />
      </section>

      {/* Processing Metrics */}
      <section 
        className="metricsSection mb-6"
        aria-label="Processing Metrics"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="metric">
            <span className="label">Success Rate</span>
            <span className="value">
              {processingMetrics.uploadCount > 0
                ? `${((processingMetrics.successCount / processingMetrics.uploadCount) * 100).toFixed(1)}%`
                : 'N/A'}
            </span>
          </div>
          <div className="metric">
            <span className="label">Average Time</span>
            <span className="value">
              {processingMetrics.averageProcessingTime > 0
                ? `${processingMetrics.averageProcessingTime.toFixed(0)}ms`
                : 'N/A'}
            </span>
          </div>
          <div className="metric">
            <span className="label">Total Processed</span>
            <span className="value">{processingMetrics.uploadCount}</span>
          </div>
          <div className="metric">
            <span className="label">Failed</span>
            <span className="value">{processingMetrics.failureCount}</span>
          </div>
        </div>
      </section>

      {/* Preview Section */}
      <section 
        className="previewSection"
        aria-label="Intelligence Previews"
      >
        {loading && (
          <div 
            className="loadingOverlay"
            role="alert"
            aria-busy="true"
          >
            Processing intelligence...
          </div>
        )}

        {error && (
          <div 
            className="errorText"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(item => (
            <IntelligencePreview
              key={item.id}
              intelligence={item}
              onClick={() => {}} // Handle preview click
              className="h-full"
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProcessPage;