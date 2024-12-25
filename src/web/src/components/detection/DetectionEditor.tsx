/**
 * @fileoverview Specialized editor component for creating and editing detection rules
 * Implements real-time validation, syntax highlighting, and AI-assisted capabilities
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { debounce } from 'lodash'; // v4.17.21
import clsx from 'clsx'; // v2.0.0
import { useMonitoring } from '@datadog/browser-rum'; // v4.0.0

// Internal imports
import CodeEditor from '../workbench/CodeEditor';
import DetectionValidation from './DetectionValidation';
import { useDetection } from '../../hooks/useDetection';
import { useTheme } from '../../hooks/useTheme';
import type { Detection } from '../../types/detection';

// Constants for performance monitoring
const VALIDATION_DEBOUNCE = 500; // ms
const PERFORMANCE_THRESHOLD = 100; // ms

interface DetectionEditorProps {
  /** Current detection being edited */
  detection: Detection;
  /** Change handler for detection updates */
  onChange: (detection: Detection) => void;
  /** Optional read-only mode flag */
  readOnly?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** Accessibility label for the editor */
  ariaLabel?: string;
}

/**
 * DetectionEditor Component
 * 
 * A specialized editor for creating and editing detection rules with
 * real-time validation, syntax highlighting, and AI-assisted capabilities.
 * Implements WCAG 2.1 AA compliance and performance monitoring.
 */
const DetectionEditor: React.FC<DetectionEditorProps> = React.memo(({
  detection,
  onChange,
  readOnly = false,
  className,
  ariaLabel = 'Detection rule editor'
}) => {
  // Hooks
  const { theme } = useTheme();
  const { validateDetection } = useDetection();
  const { addTiming } = useMonitoring();

  // State
  const [localDetection, setLocalDetection] = useState<Detection>(detection);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Memoize editor options
  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    lineNumbers: 'on',
    readOnly,
    fontSize: 14,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    accessibilitySupport: 'on',
    'aria-label': ariaLabel,
    tabSize: 2
  }), [readOnly, ariaLabel]);

  /**
   * Debounced validation handler
   * Implements performance monitoring and error handling
   */
  const handleValidation = useCallback(
    debounce(async (content: string) => {
      const startTime = performance.now();
      setIsValidating(true);

      try {
        const validationResult = await validateDetection(localDetection.id);
        
        setValidationErrors(validationResult.errors || []);
        
        // Track validation performance
        const duration = performance.now() - startTime;
        addTiming('detection_validation', duration);

        if (duration > PERFORMANCE_THRESHOLD) {
          console.warn('Detection validation exceeded performance threshold', {
            duration,
            threshold: PERFORMANCE_THRESHOLD
          });
        }
      } catch (error) {
        console.error('Validation error:', error);
        setValidationErrors(['Validation failed. Please try again.']);
      } finally {
        setIsValidating(false);
      }
    }, VALIDATION_DEBOUNCE),
    [localDetection.id, validateDetection, addTiming]
  );

  /**
   * Handles content changes with performance tracking
   */
  const handleEditorChange = useCallback((value: string) => {
    const startTime = performance.now();

    try {
      // Update local state
      setLocalDetection(prev => ({
        ...prev,
        logic: { ...prev.logic, content: value }
      }));

      // Trigger validation
      handleValidation(value);

      // Notify parent component
      onChange(localDetection);

      // Track performance
      const duration = performance.now() - startTime;
      addTiming('detection_editor_update', duration);
    } catch (error) {
      console.error('Editor update error:', error);
    }
  }, [localDetection, onChange, handleValidation, addTiming]);

  /**
   * Handles keyboard shortcuts
   */
  const handleKeyboardShortcut = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd + S to trigger validation
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      handleValidation(localDetection.logic.content);
    }
  }, [localDetection, handleValidation]);

  // Set up keyboard shortcuts
  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcut);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, [handleKeyboardShortcut]);

  return (
    <div 
      className={clsx('detection-editor', className)}
      role="region"
      aria-label={ariaLabel}
    >
      <div className="detection-editor__content">
        <CodeEditor
          value={localDetection.logic.content}
          language={localDetection.platform.toLowerCase()}
          onChange={handleEditorChange}
          readOnly={readOnly}
          options={editorOptions}
          theme={theme === 'dark' ? 'material-dark' : 'material-light'}
        />
      </div>

      <DetectionValidation
        detection={localDetection}
        onValidationComplete={(results) => {
          setValidationErrors(results.errors.map(e => e.message));
        }}
        className="detection-editor__validation"
      />

      {/* Accessibility announcement for validation status */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
      >
        {isValidating ? 'Validating detection rule...' : 
          validationErrors.length > 0 ? 
            `Validation failed with ${validationErrors.length} errors` : 
            'Detection rule is valid'}
      </div>
    </div>
  );
});

// Display name for debugging
DetectionEditor.displayName = 'DetectionEditor';

export default DetectionEditor;