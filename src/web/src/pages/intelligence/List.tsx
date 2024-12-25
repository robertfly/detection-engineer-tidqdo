/**
 * @fileoverview Intelligence List Page Component
 * Implements virtualized card-based layout with real-time status updates,
 * comprehensive filtering, and performance optimizations.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics } from '@datadog/browser-rum'; // v4.0.0

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import IntelligenceList from '../../components/intelligence/IntelligenceList';
import IntelligenceUpload from '../../components/intelligence/IntelligenceUpload';
import { useIntelligence } from '../../hooks/useIntelligence';
import { useWebSocket } from '../../hooks/useWebSocket';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import Toast from '../../components/common/Toast';

// Types
import type { Intelligence } from '../../types/intelligence';

/**
 * Performance monitoring thresholds
 */
const PERFORMANCE_THRESHOLDS = {
  RENDER_TIME: 16, // Target 60fps
  INTERACTION_DELAY: 100,
  PROCESSING_TIMEOUT: 120000 // 2 minutes as per specs
};

/**
 * Intelligence List Page Component
 * Implements comprehensive intelligence management with real-time updates
 */
const IntelligencePage: React.FC = () => {
  // Hooks
  const navigate = useNavigate();
  const { addMetric } = useMetrics();
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Intelligence management hook
  const {
    items,
    loading,
    error,
    metrics,
    fetch: fetchIntelligence,
    create: createIntelligence
  } = useIntelligence({
    autoFetch: true,
    filters: {}
  });

  // WebSocket connection for real-time updates
  const { 
    isConnected,
    sendMessage,
    connectionQuality
  } = useWebSocket(localStorage.getItem('access_token') || '', {
    autoReconnect: true,
    onError: (error) => {
      setToastMessage({
        message: `WebSocket error: ${error.message}`,
        type: 'error'
      });
    }
  });

  /**
   * Handles viewing intelligence details
   */
  const handleView = useCallback((id: string) => {
    const startTime = performance.now();
    
    navigate(`/intelligence/${id}`);
    
    // Performance monitoring
    const duration = performance.now() - startTime;
    addMetric('intelligence.view.duration', duration);
    
    if (duration > PERFORMANCE_THRESHOLDS.INTERACTION_DELAY) {
      console.warn('View interaction exceeded threshold:', {
        duration,
        threshold: PERFORMANCE_THRESHOLDS.INTERACTION_DELAY
      });
    }
  }, [navigate, addMetric]);

  /**
   * Handles stopping intelligence processing
   */
  const handleStop = useCallback(async (id: string) => {
    try {
      await sendMessage('intelligence.stop', { id });
      setToastMessage({
        message: 'Processing stopped successfully',
        type: 'success'
      });
    } catch (error) {
      setToastMessage({
        message: `Failed to stop processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
    }
  }, [sendMessage]);

  /**
   * Handles retrying failed intelligence processing
   */
  const handleRetry = useCallback(async (id: string) => {
    try {
      await sendMessage('intelligence.retry', { id });
      setToastMessage({
        message: 'Processing retry initiated',
        type: 'success'
      });
    } catch (error) {
      setToastMessage({
        message: `Failed to retry processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
    }
  }, [sendMessage]);

  /**
   * Handles successful intelligence upload
   */
  const handleUploadComplete = useCallback((intelligence: Intelligence) => {
    setToastMessage({
      message: 'Intelligence uploaded successfully',
      type: 'success'
    });
    fetchIntelligence(); // Refresh list
  }, [fetchIntelligence]);

  /**
   * Handles intelligence upload errors
   */
  const handleUploadError = useCallback((error: Error) => {
    setToastMessage({
      message: `Upload failed: ${error.message}`,
      type: 'error'
    });
  }, []);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full p-6 space-y-6">
        {/* Page Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Intelligence
          </h1>
          
          {/* Connection Status Indicator */}
          {!isConnected && (
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              Connecting to real-time updates...
            </div>
          )}
        </div>

        {/* Upload Section */}
        <ErrorBoundary>
          <div className="w-full max-w-2xl mx-auto">
            <IntelligenceUpload
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
              processingTimeout={PERFORMANCE_THRESHOLDS.PROCESSING_TIMEOUT}
            />
          </div>
        </ErrorBoundary>

        {/* Intelligence List */}
        <ErrorBoundary>
          <IntelligenceList
            className="flex-1 overflow-hidden"
            onView={handleView}
            onStop={handleStop}
            onRetry={handleRetry}
            performanceConfig={{
              enableVirtualization: true,
              itemHeight: 200,
              overscan: 5
            }}
            a11yConfig={{
              announceUpdates: true,
              labelledBy: 'intelligence-list-title',
              describedBy: 'intelligence-list-description'
            }}
          />
        </ErrorBoundary>

        {/* Toast Notifications */}
        {toastMessage && (
          <Toast
            id={`toast-${Date.now()}`}
            message={toastMessage.message}
            variant={toastMessage.type}
            duration={5000}
            onDismiss={() => setToastMessage(null)}
          />
        )}

        {/* Performance Metrics (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg text-sm">
            <h3 className="font-semibold mb-2">Performance Metrics</h3>
            <div>Processing Time: {metrics.processingTime}ms</div>
            <div>Success Rate: {metrics.successRate}%</div>
            <div>Connection Quality: {connectionQuality}</div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default IntelligencePage;