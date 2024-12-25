import React, { useCallback } from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0

// Internal imports
import { Intelligence, IntelligenceStatus } from '../../types/intelligence';
import Card from '../common/Card';
import ProgressBar from '../common/ProgressBar';
import { useTheme } from '../../hooks/useTheme';

/**
 * Props interface for IntelligenceCard component
 */
export interface IntelligenceCardProps {
  /** Intelligence item data */
  intelligence: Intelligence;
  /** Handler for viewing intelligence details */
  onView: (id: string) => void;
  /** Handler for stopping intelligence processing */
  onStop?: (id: string) => void;
  /** Handler for retrying failed intelligence processing */
  onRetry?: (id: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Accessibility label */
  'aria-label'?: string;
  /** Processing state indicator */
  isProcessing?: boolean;
  /** Test ID for component */
  testId?: string;
}

/**
 * Maps intelligence status to progress bar variant
 * @param status Current intelligence status
 * @param errorMessage Optional error message
 * @returns Progress bar variant
 */
const getStatusVariant = (
  status: IntelligenceStatus,
  errorMessage?: string | null
): 'success' | 'warning' | 'error' | undefined => {
  if (errorMessage || status === 'failed' || status === 'validation_error') {
    return 'error';
  }
  
  switch (status) {
    case 'completed':
      return 'success';
    case 'processing':
      return 'warning';
    default:
      return undefined;
  }
};

/**
 * Calculates progress value based on status and accuracy
 * @param status Current intelligence status
 * @param accuracy Processing accuracy value
 * @param hasError Whether there is an error present
 * @returns Progress value between 0-100
 */
const getProgressValue = (
  status: IntelligenceStatus,
  accuracy: number | null,
  hasError: boolean
): number => {
  if (hasError || status === 'failed' || status === 'validation_error') {
    return 0;
  }
  
  if (status === 'completed') {
    return 100;
  }
  
  if (status === 'processing' && accuracy !== null) {
    return Math.min(Math.max(accuracy, 0), 100);
  }
  
  return 0;
};

/**
 * IntelligenceCard component
 * Displays intelligence item information with enhanced status indicators and actions
 */
export const IntelligenceCard: React.FC<IntelligenceCardProps> = React.memo(({
  intelligence,
  onView,
  onStop,
  onRetry,
  className,
  'aria-label': ariaLabel,
  isProcessing = false,
  testId = 'intelligence-card',
}) => {
  const { theme } = useTheme();
  
  // Memoized handlers
  const handleView = useCallback(() => {
    onView(intelligence.id);
  }, [intelligence.id, onView]);

  const handleStop = useCallback(() => {
    if (onStop) {
      onStop(intelligence.id);
    }
  }, [intelligence.id, onStop]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry(intelligence.id);
    }
  }, [intelligence.id, onRetry]);

  // Calculate status and progress
  const hasError = Boolean(intelligence.validation_errors?.length || intelligence.status === 'failed');
  const statusVariant = getStatusVariant(intelligence.status, intelligence.validation_errors?.[0]);
  const progressValue = getProgressValue(
    intelligence.status,
    intelligence.processing_accuracy,
    hasError
  );

  return (
    <Card
      className={classNames(
        'transition-all duration-200',
        'hover:shadow-md',
        className
      )}
      elevation={1}
      interactive
      onClick={handleView}
      aria-label={ariaLabel || `Intelligence item: ${intelligence.name}`}
      role="article"
      data-testid={testId}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
            {intelligence.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {intelligence.source_type}
          </p>
        </div>
        
        {isProcessing && (
          <span 
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            role="status"
          >
            Processing
          </span>
        )}
      </div>

      <ProgressBar
        value={progressValue}
        variant={statusVariant}
        size="medium"
        aria-label={`Processing progress: ${progressValue}%`}
        className="mb-4"
      />

      {hasError && intelligence.validation_errors && (
        <div 
          className="text-sm text-error-500 dark:text-error-400 mb-4"
          role="alert"
        >
          {intelligence.validation_errors[0]}
        </div>
      )}

      <div className="flex justify-end gap-2">
        {intelligence.status === 'processing' && onStop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStop();
            }}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="Stop processing"
          >
            Stop
          </button>
        )}

        {(intelligence.status === 'failed' || intelligence.status === 'validation_error') && onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRetry();
            }}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="Retry processing"
          >
            Retry
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleView();
          }}
          className="inline-flex items-center px-3 py-2 bg-primary-600 hover:bg-primary-700 rounded-md text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          aria-label="View details"
        >
          View
        </button>
      </div>
    </Card>
  );
});

IntelligenceCard.displayName = 'IntelligenceCard';

export default IntelligenceCard;