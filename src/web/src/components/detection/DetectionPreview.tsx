import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.3.0
import { useTranslation } from 'react-i18next'; // v13.0.0

// Internal imports
import { Detection } from '../../types/detection';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Tooltip from '../common/Tooltip';

/**
 * Maps detection status to semantic badge variant with enhanced accessibility
 */
const getStatusVariant = (status: Detection['status']): string => {
  const statusMap: Record<Detection['status'], string> = {
    draft: 'info',
    active: 'success',
    archived: 'secondary',
    deprecated: 'error'
  };
  return statusMap[status];
};

/**
 * Smart description truncation preserving important information
 */
const truncateDescription = (text: string, length = 120, preserveWords = true): string => {
  if (text.length <= length) return text;
  
  const truncated = preserveWords 
    ? text.substr(0, text.lastIndexOf(' ', length))
    : text.substr(0, length);
    
  return `${truncated}...`;
};

/**
 * Enhanced props interface for DetectionPreview component with loading and error states
 */
export interface DetectionPreviewProps {
  /** Detection object containing comprehensive rule details */
  detection: Detection;
  /** Async callback for view action with loading state */
  onView: (id: string) => Promise<void>;
  /** Async callback for edit action with loading state */
  onEdit: (id: string) => Promise<void>;
  /** Async callback for delete action with confirmation */
  onDelete: (id: string) => Promise<void>;
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Loading state indicator for async operations */
  isLoading?: boolean;
  /** Error state for failed operations */
  error?: Error;
  /** Card elevation level */
  elevation?: number;
  /** Whether the card is interactive */
  isInteractive?: boolean;
}

/**
 * A React component that displays a preview of a security detection rule
 * with its key metadata, status, and actions. Implements Material Design 3.0
 * specifications with enhanced accessibility support and responsive layout.
 */
const DetectionPreview: React.FC<DetectionPreviewProps> = React.memo(({
  detection,
  onView,
  onEdit,
  onDelete,
  className,
  isLoading = false,
  error,
  elevation = 1,
  isInteractive = true
}) => {
  const { t } = useTranslation();

  // Memoized MITRE techniques count
  const techniqueCount = useMemo(() => 
    Object.values(detection.mitre_mapping).flat().length,
    [detection.mitre_mapping]
  );

  // Format timestamps for better accessibility
  const formattedDates = useMemo(() => ({
    created: new Date(detection.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
    updated: new Date(detection.updated_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }), [detection.created_at, detection.updated_at]);

  return (
    <Card
      className={classNames(
        'detection-preview',
        'w-full',
        'transition-all duration-200',
        className
      )}
      elevation={elevation}
      interactive={isInteractive}
      role="article"
      ariaLabel={`Detection: ${detection.name}`}
    >
      {/* Header Section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {detection.name}
          </h3>
          <Badge
            variant={getStatusVariant(detection.status)}
            className="capitalize"
          >
            {detection.status}
          </Badge>
        </div>
        <Badge variant="secondary">
          {detection.platform}
        </Badge>
      </div>

      {/* Description Section */}
      <Tooltip content={detection.description}>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          {truncateDescription(detection.description)}
        </p>
      </Tooltip>

      {/* Metadata Section */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div className="flex flex-col">
          <span className="text-gray-500 dark:text-gray-400">
            {t('detection.created')}
          </span>
          <time dateTime={detection.created_at}>
            {formattedDates.created}
          </time>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-500 dark:text-gray-400">
            {t('detection.updated')}
          </span>
          <time dateTime={detection.updated_at}>
            {formattedDates.updated}
          </time>
        </div>
      </div>

      {/* MITRE Mapping Badge */}
      <div className="mb-4">
        <Tooltip content={t('detection.mitreTechniques')}>
          <Badge variant="info" className="mr-2">
            {`${techniqueCount} ${t('detection.techniques')}`}
          </Badge>
        </Tooltip>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2 justify-end">
        <Button
          variant="text"
          size="small"
          onClick={() => onView(detection.id)}
          disabled={isLoading}
          ariaLabel={t('detection.view')}
        >
          {t('detection.view')}
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={() => onEdit(detection.id)}
          disabled={isLoading}
          ariaLabel={t('detection.edit')}
        >
          {t('detection.edit')}
        </Button>
        <Button
          variant="primary"
          size="small"
          onClick={() => onDelete(detection.id)}
          disabled={isLoading}
          ariaLabel={t('detection.delete')}
        >
          {t('detection.delete')}
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mt-4 p-2 bg-error-50 dark:bg-error-900 text-error-700 dark:text-error-200 rounded-md text-sm">
          {error.message}
        </div>
      )}
    </Card>
  );
});

// Display name for debugging
DetectionPreview.displayName = 'DetectionPreview';

export default DetectionPreview;