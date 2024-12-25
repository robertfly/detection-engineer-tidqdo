/**
 * @fileoverview Main workbench page component providing AI-powered detection engineering interface
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { debounce } from 'lodash'; // v4.17.21
import AIChat from '../../components/workbench/AIChat';
import CodeEditor from '../../components/workbench/CodeEditor';
import SplitPane from '../../components/workbench/SplitPane';
import Toolbar from '../../components/workbench/Toolbar';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useDetection } from '../../hooks/useDetection';

// Constants for performance optimization
const AUTOSAVE_DELAY = 1000;
const VALIDATION_DEBOUNCE = 500;
const PERFORMANCE_THRESHOLD = 100; // ms

// Props interface
interface WorkbenchProps {
  detectionId?: string;
  autoSave?: boolean;
  onError?: (error: Error) => void;
}

// State interface
interface WorkbenchState {
  content: string;
  isLoading: boolean;
  error: Error | null;
  performance: {
    lastUpdateTime: number;
    averageResponseTime: number;
    updateCount: number;
  };
}

/**
 * Main workbench component implementing AI-powered detection engineering interface
 * with real-time validation and performance monitoring
 */
const Workbench: React.FC<WorkbenchProps> = ({
  detectionId,
  autoSave = true,
  onError
}) => {
  // Initialize state
  const [state, setState] = useState<WorkbenchState>({
    content: '',
    isLoading: false,
    error: null,
    performance: {
      lastUpdateTime: 0,
      averageResponseTime: 0,
      updateCount: 0
    }
  });

  // Initialize detection hooks
  const {
    selectedDetection,
    loading,
    error: detectionError,
    createDetection,
    updateDetection,
    validateDetection
  } = useDetection();

  // Memoize toolbar loading states
  const toolbarLoadingStates = useMemo(() => ({
    validate: loading.validate,
    translate: loading.translate,
    save: loading.create || loading.update
  }), [loading]);

  /**
   * Handles content updates with performance tracking and error handling
   */
  const handleContentUpdate = useCallback(async (content: string) => {
    const startTime = performance.now();

    try {
      setState(prev => ({
        ...prev,
        content,
        isLoading: true,
        error: null
      }));

      // Update detection if autoSave is enabled
      if (autoSave && selectedDetection) {
        await updateDetection(selectedDetection.id, {
          ...selectedDetection,
          logic: content
        });
      }

      // Track performance metrics
      const endTime = performance.now();
      const updateTime = endTime - startTime;

      setState(prev => ({
        ...prev,
        isLoading: false,
        performance: {
          lastUpdateTime: updateTime,
          averageResponseTime: (prev.performance.averageResponseTime * prev.performance.updateCount + updateTime) / (prev.performance.updateCount + 1),
          updateCount: prev.performance.updateCount + 1
        }
      }));

      // Log performance warning if threshold exceeded
      if (updateTime > PERFORMANCE_THRESHOLD) {
        console.warn('Content update exceeded performance threshold:', {
          updateTime,
          threshold: PERFORMANCE_THRESHOLD
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error(errorMessage)
      }));
      onError?.(new Error(errorMessage));
    }
  }, [autoSave, selectedDetection, updateDetection, onError]);

  // Debounced content update handler
  const debouncedContentUpdate = useMemo(
    () => debounce(handleContentUpdate, AUTOSAVE_DELAY),
    [handleContentUpdate]
  );

  /**
   * Handles detection validation with error handling
   */
  const handleValidate = useCallback(async () => {
    if (!selectedDetection) return;

    try {
      await validateDetection(selectedDetection.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      onError?.(new Error(errorMessage));
    }
  }, [selectedDetection, validateDetection, onError]);

  /**
   * Handles detection translation with error handling
   */
  const handleTranslate = useCallback(async () => {
    if (!selectedDetection) return;

    try {
      // Translation logic would be implemented here
      console.log('Translation requested for detection:', selectedDetection.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Translation failed';
      onError?.(new Error(errorMessage));
    }
  }, [selectedDetection, onError]);

  /**
   * Handles detection saving with error handling
   */
  const handleSave = useCallback(async () => {
    if (!state.content) return;

    try {
      if (selectedDetection) {
        await updateDetection(selectedDetection.id, {
          ...selectedDetection,
          logic: state.content
        });
      } else {
        await createDetection({
          name: 'New Detection',
          logic: state.content,
          platform: 'sigma'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Save failed';
      onError?.(new Error(errorMessage));
    }
  }, [state.content, selectedDetection, createDetection, updateDetection, onError]);

  // Load detection on mount or ID change
  useEffect(() => {
    if (detectionId && selectedDetection) {
      setState(prev => ({
        ...prev,
        content: JSON.stringify(selectedDetection.logic, null, 2)
      }));
    }
  }, [detectionId, selectedDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedContentUpdate.cancel();
    };
  }, [debouncedContentUpdate]);

  return (
    <ErrorBoundary onError={onError}>
      <div className="flex flex-col h-full bg-background-primary">
        <Toolbar
          onValidate={handleValidate}
          onTranslate={handleTranslate}
          onSave={handleSave}
          loading={toolbarLoadingStates}
          isValid={!state.error}
          hasChanges={Boolean(state.content)}
          platform={selectedDetection?.platform || 'sigma'}
        />
        
        <div className="flex-1 min-h-0 relative">
          <SplitPane>
            <AIChat
              onDetectionUpdate={handleContentUpdate}
              className="h-full"
              onError={onError}
            />
            <CodeEditor
              value={state.content}
              language="detection"
              onChange={debouncedContentUpdate}
              readOnly={state.isLoading}
              onValidation={handleValidate}
            />
          </SplitPane>
        </div>

        {state.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-error-background text-error-foreground">
            {state.error.message}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default Workbench;