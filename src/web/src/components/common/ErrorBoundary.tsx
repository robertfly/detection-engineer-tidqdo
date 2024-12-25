import React from 'react'; // v18.2+
import Toast from './Toast';

// Props interface for ErrorBoundary component
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | null;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

// State interface for ErrorBoundary component
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// Error severity classification
enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI while reporting to monitoring systems.
 * 
 * @extends {React.Component<ErrorBoundaryProps, ErrorBoundaryState>}
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  /**
   * Static method to update state when an error occurs
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  /**
   * Classifies error severity based on error type and stack trace
   */
  private classifyErrorSeverity(error: Error): ErrorSeverity {
    if (error instanceof TypeError || error instanceof ReferenceError) {
      return ErrorSeverity.HIGH;
    }
    if (error instanceof SyntaxError) {
      return ErrorSeverity.CRITICAL;
    }
    if (error.stack?.includes('async')) {
      return ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.LOW;
  }

  /**
   * Sanitizes error message for user display
   */
  private sanitizeErrorMessage(error: Error): string {
    // Remove sensitive information like file paths and line numbers
    const sanitized = error.message.replace(/\(.*\)/g, '')
      .replace(/at.*(?=\n)/g, '')
      .trim();
    
    return sanitized || 'An unexpected error occurred';
  }

  /**
   * Attempts to recover from recoverable errors
   */
  private attemptRecovery(error: Error): boolean {
    // Check if error is recoverable
    const isRecoverable = ![
      TypeError,
      ReferenceError,
      SyntaxError
    ].some(errorType => error instanceof errorType);

    if (isRecoverable) {
      // Reset error state for recoverable errors
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
      });
      return true;
    }

    return false;
  }

  /**
   * Lifecycle method called when an error occurs
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Update component state
    this.setState({
      error,
      errorInfo
    });

    // Classify error severity
    const severity = this.classifyErrorSeverity(error);
    
    // Create sanitized error message for user display
    const sanitizedMessage = this.sanitizeErrorMessage(error);

    // Display error notification to user
    const toastMessage = severity === ErrorSeverity.CRITICAL 
      ? 'A critical error has occurred. Please refresh the page.'
      : sanitizedMessage;

    // Show error toast with appropriate variant
    const toastVariant = severity === ErrorSeverity.CRITICAL ? 'error' : 'warning';
    
    // Display toast notification
    Toast && <Toast
      id={`error-${Date.now()}`}
      message={toastMessage}
      variant={toastVariant}
      duration={severity === ErrorSeverity.CRITICAL ? 0 : 5000}
      important={severity === ErrorSeverity.CRITICAL}
      role="alert"
    />;

    // Call onError prop if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Attempt recovery for non-critical errors
    if (severity !== ErrorSeverity.CRITICAL) {
      this.attemptRecovery(error);
    }
  }

  /**
   * Renders either the error fallback UI or the children components
   */
  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // If custom fallback is provided, render it
      if (fallback) {
        return fallback;
      }

      // Default fallback UI with WCAG 2.1 AA compliance
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: '20px',
            margin: '20px',
            borderRadius: '4px',
            backgroundColor: '#FFF3F4',
            border: '1px solid #FFA7A7',
            color: '#D32F2F'
          }}
        >
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0', fontSize: '1rem' }}>
            {this.sanitizeErrorMessage(error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#D32F2F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            aria-label="Refresh page"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    // If no error, render children normally
    return children;
  }
}

export default ErrorBoundary;