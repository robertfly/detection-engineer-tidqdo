/**
 * @fileoverview Intelligence preview component with accessibility support
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0
import { Intelligence, IntelligenceStatus } from '../../types/intelligence';
import Card from '../common/Card';
import ProgressBar from '../common/ProgressBar';

/**
 * Props interface for the IntelligencePreview component
 */
export interface IntelligencePreviewProps {
  /** Intelligence item to display */
  intelligence: Intelligence;
  /** Click handler for the preview card */
  onClick: () => void;
  /** Optional additional CSS classes */
  className?: string;
  /** Optional test ID for testing */
  testId?: string;
}

/**
 * Determines the progress bar variant based on intelligence status and accuracy
 * Ensures proper color contrast for WCAG 2.1 AA compliance
 */
const getStatusVariant = (
  status: IntelligenceStatus,
  accuracy: number | null
): 'success' | 'warning' | 'error' => {
  if (status === 'failed' || status === 'validation_error') {
    return 'error';
  }
  if (status === 'completed' && accuracy !== null) {
    return accuracy >= 85 ? 'success' : 'warning';
  }
  return 'warning';
};

/**
 * Calculates progress value based on intelligence status
 * Returns -1 for indeterminate progress
 */
const getProgressValue = (
  status: IntelligenceStatus,
  accuracy: number | null
): number => {
  switch (status) {
    case 'completed':
      return 100;
    case 'failed':
    case 'validation_error':
      return 0;
    case 'processing':
      return accuracy ?? -1;
    case 'pending':
      return -1;
    default:
      return 0;
  }
};

/**
 * Gets the appropriate status text for screen readers
 */
const getStatusText = (status: IntelligenceStatus, accuracy: number | null): string => {
  switch (status) {
    case 'completed':
      return `Processing completed with ${accuracy}% accuracy`;
    case 'failed':
      return 'Processing failed';
    case 'validation_error':
      return 'Validation error occurred';
    case 'processing':
      return `Processing in progress: ${accuracy ?? 0}% complete`;
    case 'pending':
      return 'Pending processing';
    default:
      return 'Unknown status';
  }
};

/**
 * Intelligence Preview Component
 * Displays a preview of intelligence data with processing status and accessibility support
 */
export const IntelligencePreview: React.FC<IntelligencePreviewProps> = React.memo(({
  intelligence,
  onClick,
  className,
  testId = 'intelligence-preview'
}) => {
  const {
    name,
    source_type,
    status,
    processing_accuracy,
    source_content,
    validation_errors
  } = intelligence;

  const statusVariant = getStatusVariant(status, processing_accuracy);
  const progressValue = getProgressValue(status, processing_accuracy);
  const statusText = getStatusText(status, processing_accuracy);

  return (
    <Card
      onClick={onClick}
      className={classNames('preview', className)}
      interactive
      elevation={1}
      role="article"
      ariaLabel={`Intelligence preview: ${name}`}
      data-testid={testId}
    >
      <div className="header">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Source: {source_type}
          </p>
        </div>
        {processing_accuracy !== null && (
          <span 
            className="text-sm font-medium"
            aria-label={`Processing accuracy: ${processing_accuracy}%`}
          >
            {processing_accuracy}%
          </span>
        )}
      </div>

      <ProgressBar
        value={progressValue}
        variant={statusVariant}
        indeterminate={progressValue === -1}
        ariaLabel={statusText}
        className="my-3"
      />

      {validation_errors && validation_errors.length > 0 ? (
        <div 
          className="content text-error-600 dark:text-error-400"
          role="alert"
        >
          {validation_errors[0]}
        </div>
      ) : source_content ? (
        <div className="content">
          {source_content}
        </div>
      ) : null}
    </Card>
  );
});

// Display name for debugging
IntelligencePreview.displayName = 'IntelligencePreview';

export default IntelligencePreview;