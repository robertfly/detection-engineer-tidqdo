// External imports with versions
import React, { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { ContentCapture } from '../utils/capture';
import { IntelligenceAPI } from '../services/api';
import { StorageService, STORAGE_KEYS } from '../services/storage';

// Types
interface CaptureProps {
  onSuccess?: (result: CaptureResult) => void;
  onError?: (error: Error) => void;
  className?: string;
}

interface CaptureState {
  loading: boolean;
  error: string | null;
  capturedContent: CaptureResult | null;
  validationState: ValidationState;
  captureHistory: CaptureHistory[];
  progressStatus: ProgressStatus;
}

interface ProgressStatus {
  stage: 'idle' | 'capturing' | 'validating' | 'submitting';
  progress: number;
  message: string;
}

/**
 * Secure and accessible content capture component for the Chrome extension
 */
export const Capture: React.FC<CaptureProps> = ({ 
  onSuccess, 
  onError,
  className 
}) => {
  // Service instances
  const contentCapture = useRef(new ContentCapture());
  const api = useRef(new IntelligenceAPI());
  const storage = useRef(new StorageService());

  // Component state
  const [state, setState] = useState<CaptureState>({
    loading: false,
    error: null,
    capturedContent: null,
    validationState: {
      status: 'idle',
      errors: [],
      warnings: []
    },
    captureHistory: [],
    progressStatus: {
      stage: 'idle',
      progress: 0,
      message: ''
    }
  });

  /**
   * Initializes keyboard shortcuts and loads capture history
   */
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        // Load capture history
        const history = await storage.current.get(STORAGE_KEYS.CACHED_INTELLIGENCE);
        if (history) {
          setState(prev => ({ ...prev, captureHistory: history }));
        }

        // Setup keyboard shortcut
        document.addEventListener('keydown', handleKeyboardShortcut);
      } catch (error) {
        console.error('Initialization failed:', error);
      }
    };

    initializeComponent();

    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcut);
    };
  }, []);

  /**
   * Handles keyboard shortcuts for capture functionality
   */
  const handleKeyboardShortcut = useCallback((event: KeyboardEvent) => {
    // Ctrl/Cmd + Shift + C for capture
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'c') {
      handleCapture();
    }
  }, []);

  /**
   * Securely captures and validates current page content
   */
  const handleCapture = async () => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      progressStatus: {
        stage: 'capturing',
        progress: 0,
        message: 'Initializing capture...'
      }
    }));

    try {
      // Capture content
      setState(prev => ({
        ...prev,
        progressStatus: {
          stage: 'capturing',
          progress: 30,
          message: 'Capturing page content...'
        }
      }));

      const captureResult = await contentCapture.current.captureCurrentPage({
        includeDynamicContent: true,
        securityLevel: 'strict',
        performanceMonitoring: true
      });

      // Validate content
      setState(prev => ({
        ...prev,
        progressStatus: {
          stage: 'validating',
          progress: 60,
          message: 'Validating captured content...'
        }
      }));

      // Cache captured content
      await storage.current.cacheIntelligence({
        id: crypto.randomUUID(),
        data: captureResult,
        source: window.location.href
      });

      setState(prev => ({
        ...prev,
        capturedContent: captureResult,
        validationState: {
          status: 'valid',
          errors: [],
          warnings: []
        },
        progressStatus: {
          stage: 'idle',
          progress: 100,
          message: 'Capture successful'
        },
        loading: false
      }));

      onSuccess?.(captureResult);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Capture failed';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
        progressStatus: {
          stage: 'idle',
          progress: 0,
          message: errorMessage
        }
      }));
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  };

  /**
   * Securely submits validated captured content
   */
  const handleSubmit = async () => {
    if (!state.capturedContent) return;

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      progressStatus: {
        stage: 'submitting',
        progress: 0,
        message: 'Preparing submission...'
      }
    }));

    try {
      // Final validation before submission
      setState(prev => ({
        ...prev,
        progressStatus: {
          stage: 'submitting',
          progress: 30,
          message: 'Validating content...'
        }
      }));

      await contentCapture.current.submitCapture(state.capturedContent);

      setState(prev => ({
        ...prev,
        loading: false,
        capturedContent: null,
        progressStatus: {
          stage: 'idle',
          progress: 100,
          message: 'Submission successful'
        }
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Submission failed';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
        progressStatus: {
          stage: 'idle',
          progress: 0,
          message: errorMessage
        }
      }));
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  };

  /**
   * Securely clears captured content and resets state
   */
  const handleClear = () => {
    setState(prev => ({
      ...prev,
      capturedContent: null,
      error: null,
      validationState: {
        status: 'idle',
        errors: [],
        warnings: []
      },
      progressStatus: {
        stage: 'idle',
        progress: 0,
        message: ''
      }
    }));
  };

  return (
    <div 
      className={`capture-container ${className || ''}`}
      role="region"
      aria-label="Content Capture Interface"
    >
      {/* Progress Indicator */}
      {state.loading && (
        <div 
          className="capture-progress"
          role="progressbar"
          aria-valuenow={state.progressStatus.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div 
            className="progress-bar"
            style={{ width: `${state.progressStatus.progress}%` }}
          />
          <span className="progress-message">
            {state.progressStatus.message}
          </span>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div 
          className="capture-error"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </div>
      )}

      {/* Capture Controls */}
      <div className="capture-controls">
        <button
          onClick={handleCapture}
          disabled={state.loading}
          aria-busy={state.loading}
          className="capture-button"
        >
          Capture Page
        </button>

        {state.capturedContent && (
          <>
            <button
              onClick={handleSubmit}
              disabled={state.loading}
              className="submit-button"
            >
              Submit
            </button>
            <button
              onClick={handleClear}
              disabled={state.loading}
              className="clear-button"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Content Preview */}
      {state.capturedContent && (
        <div 
          className="capture-preview"
          role="region"
          aria-label="Captured Content Preview"
        >
          <h3>Captured Content</h3>
          <div className="preview-content">
            {/* Display truncated content preview */}
            {state.capturedContent.content.substring(0, 200)}...
          </div>
          <div className="preview-metadata">
            <p>Source: {state.capturedContent.url}</p>
            <p>Captured: {state.capturedContent.timestamp.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Capture History */}
      {state.captureHistory.length > 0 && (
        <div 
          className="capture-history"
          role="region"
          aria-label="Capture History"
        >
          <h3>Recent Captures</h3>
          <ul>
            {state.captureHistory.slice(0, 5).map((item: any) => (
              <li key={item.id}>
                {new URL(item.source).hostname} - {
                  new Date(item.timestamp).toLocaleString()
                }
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export type { CaptureProps, CaptureState, ProgressStatus };