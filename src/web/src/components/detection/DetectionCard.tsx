import React, { useMemo } from 'react';
import clsx from 'clsx'; // v2.0.0
import { Detection } from '../../types/detection';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Tooltip from '../common/Tooltip';

/**
 * Props interface for DetectionCard component
 */
export interface DetectionCardProps {
  /** Detection object containing all rule information */
  detection: Detection;
  /** Optional CSS class name for custom styling */
  className?: string;
  /** Click handler for the entire card */
  onClick?: (detection: Detection) => void;
  /** Handler for edit action */
  onEdit?: (detection: Detection) => void;
  /** Handler for delete action */
  onDelete?: (detection: Detection) => void;
  /** Controls visibility of action buttons */
  showActions?: boolean;
  /** Indicates if the card is currently selected */
  isSelected?: boolean;
  /** Test ID for automated testing */
  testId?: string;
}

/**
 * Maps detection status to appropriate badge variant with accessibility labels
 */
const getStatusVariant = (status: Detection['status']): {
  variant: 'success' | 'warning' | 'error' | 'info';
  label: string;
} => {
  const statusMap = {
    active: { variant: 'success' as const, label: 'Active detection rule' },
    draft: { variant: 'info' as const, label: 'Draft detection rule' },
    archived: { variant: 'warning' as const, label: 'Archived detection rule' },
    deprecated: { variant: 'error' as const, label: 'Deprecated detection rule' },
  };
  return statusMap[status] || { variant: 'info', label: 'Unknown status' };
};

/**
 * Formats MITRE ATT&CK mapping for display with truncation
 */
const formatMitreMapping = (mitreMapping: Record<string, string[]>): {
  display: string;
  full: string;
  count: number;
} => {
  const techniques = Object.keys(mitreMapping).sort();
  const count = techniques.length;
  const full = techniques.join(', ');
  const display = techniques.length > 3 
    ? `${techniques.slice(0, 3).join(', ')} +${techniques.length - 3}`
    : full;

  return { display, full, count };
};

/**
 * A reusable card component for displaying detection rule information
 * following Material Design 3.0 specifications with enhanced accessibility
 */
export const DetectionCard = React.memo<DetectionCardProps>(({
  detection,
  className,
  onClick,
  onEdit,
  onDelete,
  showActions = true,
  isSelected = false,
  testId = 'detection-card',
}) => {
  // Memoize status variant and MITRE mapping
  const statusInfo = useMemo(() => getStatusVariant(detection.status), [detection.status]);
  const mitreInfo = useMemo(() => formatMitreMapping(detection.mitre_mapping), [detection.mitre_mapping]);

  // Format dates for display
  const formattedDates = useMemo(() => ({
    created: new Date(detection.created_at).toLocaleDateString(),
    updated: new Date(detection.updated_at).toLocaleDateString(),
  }), [detection.created_at, detection.updated_at]);

  return (
    <Card
      variant={isSelected ? 'filled' : 'outlined'}
      elevation={isSelected ? 2 : 1}
      interactive={Boolean(onClick)}
      onClick={onClick ? () => onClick(detection) : undefined}
      className={clsx(
        'detection-card',
        'w-full',
        'transition-all duration-200',
        {
          'ring-2 ring-primary-500': isSelected,
          'hover:ring-1 hover:ring-primary-200': !isSelected && onClick,
        },
        className
      )}
      aria-selected={isSelected}
      role="article"
      data-testid={testId}
    >
      <div className="flex flex-col gap-4">
        {/* Header Section */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1">
              {detection.name}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {detection.description}
            </p>
          </div>
          <Badge
            variant={statusInfo.variant}
            className="ml-4"
            aria-label={statusInfo.label}
          >
            {detection.status}
          </Badge>
        </div>

        {/* Platform and MITRE Mapping */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Platform:
            </span>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              {detection.platform}
            </span>
          </div>
          <Tooltip
            content={mitreInfo.full}
            position="top"
            className="flex items-center"
          >
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                MITRE ATT&CK:
              </span>
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                {mitreInfo.display}
              </span>
            </div>
          </Tooltip>
        </div>

        {/* Metadata and Actions */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Created: {formattedDates.created}</span>
            <span>Updated: {formattedDates.updated}</span>
          </div>
          {showActions && (
            <div className="flex gap-2">
              {onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(detection);
                  }}
                  className="p-2 text-gray-600 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                  aria-label="Edit detection"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(detection);
                  }}
                  className="p-2 text-gray-600 hover:text-error-600 dark:text-gray-400 dark:hover:text-error-400"
                  aria-label="Delete detection"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
});

DetectionCard.displayName = 'DetectionCard';

export default DetectionCard;