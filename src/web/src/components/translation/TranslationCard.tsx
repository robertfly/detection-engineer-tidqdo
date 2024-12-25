import React, { useCallback, useState } from 'react';
import classNames from 'classnames'; // v2.3.0
import Card from '../common/Card';
import Badge from '../common/Badge';
import Tooltip from '../common/Tooltip';
import { Translation, TranslationStatus } from '../../types/translation';

// Constants for status colors and thresholds
const STATUS_COLORS = {
  COMPLETED: 'success',
  IN_PROGRESS: 'warning',
  FAILED: 'error',
  PENDING: 'info',
  VALIDATION_FAILED: 'error'
} as const;

const ACCURACY_THRESHOLD = 95;
const ANIMATION_DURATION = 200;

/**
 * Props interface for the TranslationCard component
 */
export interface TranslationCardProps {
  /** Translation object containing all details */
  translation: Translation;
  /** Optional CSS class name */
  className?: string;
  /** Callback for viewing translation details */
  onView: (translation: Translation) => void;
  /** Callback for copying translation logic */
  onCopy: (translation: Translation) => void;
  /** Optional callback for deleting translation */
  onDelete?: (translation: Translation) => void;
  /** Loading state indicator */
  isLoading?: boolean;
  /** Controls visibility of accuracy metrics */
  showAccuracy?: boolean;
  /** Card elevation level (0-3) */
  elevation?: number;
}

/**
 * Determines badge color based on translation status and accuracy
 */
const getStatusColor = (status: TranslationStatus, accuracy?: number): string => {
  if (accuracy !== undefined && accuracy < ACCURACY_THRESHOLD) {
    return 'warning';
  }
  return STATUS_COLORS[status] || 'info';
};

/**
 * TranslationCard component displays translation details with interactive features
 * and accessibility support following Material Design 3.0 guidelines.
 */
const TranslationCard: React.FC<TranslationCardProps> = ({
  translation,
  className,
  onView,
  onCopy,
  onDelete,
  isLoading = false,
  showAccuracy = true,
  elevation = 1,
}) => {
  const [isCopying, setIsCopying] = useState(false);

  // Handle copy action with loading state and feedback
  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isCopying) return;

    try {
      setIsCopying(true);
      await onCopy(translation);
    } catch (error) {
      console.error('Failed to copy translation:', error);
    } finally {
      setTimeout(() => setIsCopying(false), ANIMATION_DURATION);
    }
  }, [isCopying, onCopy, translation]);

  // Handle delete action with confirmation
  const handleDelete = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (onDelete && window.confirm('Are you sure you want to delete this translation?')) {
      onDelete(translation);
    }
  }, [onDelete, translation]);

  // Format accuracy percentage for display
  const accuracyDisplay = translation.metadata.accuracy_score.toFixed(1);

  return (
    <Card
      className={classNames(
        'translation-card',
        'hover:shadow-md',
        'transition-all duration-200',
        'focus-within:ring-2 focus-within:ring-primary-500',
        className
      )}
      elevation={elevation}
      interactive
      onClick={() => onView(translation)}
      role="article"
      ariaLabel={`Translation for ${translation.platform}`}
    >
      <div className="flex justify-between items-center mb-4 flex-wrap md:flex-nowrap gap-2">
        <div className="flex items-center">
          <span className="text-sm md:text-base font-medium text-gray-700 dark:text-gray-300">
            {translation.platform}
          </span>
          <Tooltip content={`Status: ${translation.status}`}>
            <Badge
              variant={getStatusColor(translation.status, translation.metadata.accuracy_score)}
              className="ml-2"
              size="small"
            >
              {translation.status}
            </Badge>
          </Tooltip>
          {showAccuracy && (
            <Tooltip content={`Translation accuracy: ${accuracyDisplay}%`}>
              <span className="text-xs font-medium ml-2 text-gray-500 dark:text-gray-400">
                {accuracyDisplay}%
              </span>
            </Tooltip>
          )}
        </div>

        <div className="flex gap-2 mt-4 justify-end flex-wrap md:flex-nowrap">
          <button
            className="btn btn-icon"
            onClick={handleCopy}
            disabled={isCopying || isLoading}
            aria-label="Copy translation"
          >
            {isCopying ? 'Copied!' : 'Copy'}
          </button>
          {onDelete && (
            <button
              className="btn btn-icon btn-danger"
              onClick={handleDelete}
              disabled={isLoading}
              aria-label="Delete translation"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        <pre className="whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900 p-4 rounded">
          {translation.translated_logic}
        </pre>
      </div>

      {translation.error_message && (
        <div className="mt-4 text-sm text-error-500 dark:text-error-400 bg-error-50 dark:bg-error-900/20 p-3 rounded">
          {translation.error_message}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
        <span>Created: {new Date(translation.created_at).toLocaleDateString()}</span>
        <span>Updated: {new Date(translation.updated_at).toLocaleDateString()}</span>
      </div>
    </Card>
  );
};

export default TranslationCard;