// @ts-check
import React from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0
import Card, { CardProps } from '../common/Card';
import Badge from '../common/Badge';
import { Coverage, CoverageType } from '../../types/coverage';

/**
 * Props interface for the TechniqueCard component
 * @interface
 */
interface TechniqueCardProps {
  /** MITRE technique data with coverage metrics */
  technique: Coverage;
  /** Optional CSS classes for custom styling */
  className?: string;
  /** Optional click handler for card interaction */
  onClick?: (technique: Coverage) => void;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
}

/**
 * Determines the appropriate badge variant based on coverage percentage
 * following WCAG 2.1 AA color contrast requirements
 * 
 * @param coveragePercentage - Coverage percentage value
 * @returns Badge variant with accessible color scheme
 */
const getCoverageBadgeVariant = (coveragePercentage: number): 'success' | 'warning' | 'error' => {
  if (coveragePercentage >= 80) {
    return 'success'; // #1B5E20 - Meets 4.5:1 contrast ratio
  }
  if (coveragePercentage >= 50) {
    return 'warning'; // #E65100 - Meets 4.5:1 contrast ratio
  }
  return 'error'; // #B71C1C - Meets 4.5:1 contrast ratio
};

/**
 * TechniqueCard component displays MITRE ATT&CK technique information
 * with coverage metrics in a Material Design 3.0 compliant card format
 * 
 * @component
 * @example
 * ```tsx
 * <TechniqueCard
 *   technique={techniqueData}
 *   onClick={handleTechniqueClick}
 *   ariaLabel="View technique details"
 * />
 * ```
 */
const TechniqueCard: React.FC<TechniqueCardProps> = React.memo(({
  technique,
  className,
  onClick,
  ariaLabel,
}) => {
  // Compute badge variant based on coverage percentage
  const badgeVariant = getCoverageBadgeVariant(technique.coverage_percentage);

  // Handle keyboard interaction
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(technique);
    }
  };

  // Handle click events
  const handleClick = () => {
    if (onClick) {
      onClick(technique);
    }
  };

  return (
    <Card
      className={classNames(
        'technique-card',
        'transition-all duration-200',
        'hover:translate-y-[-2px]',
        'focus-within:ring-2 focus-within:ring-primary-500',
        className
      )}
      variant="outlined"
      elevation={1}
      interactive={Boolean(onClick)}
      onClick={handleClick}
      role="article"
      ariaLabel={ariaLabel || `Technique ${technique.name} with ${technique.coverage_percentage}% coverage`}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="p-4 space-y-3">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {technique.name}
            </h3>
            <span 
              className="text-sm text-gray-500 dark:text-gray-400"
              aria-label="MITRE ATT&CK ID"
            >
              {technique.mitre_id}
            </span>
          </div>
          <Badge
            variant={badgeVariant}
            className="ml-2"
            aria-label={`Coverage: ${technique.coverage_percentage}%`}
          >
            {`${technique.coverage_percentage}%`}
          </Badge>
        </div>

        {/* Content Section */}
        <div className="space-y-2">
          {/* Detection Count */}
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
            <span className="mr-1">Detections:</span>
            <span className="font-medium">{technique.detection_count}</span>
          </div>

          {/* Metadata Section */}
          {technique.metadata && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <div className="line-clamp-2">
                {technique.metadata.description}
              </div>
              {technique.metadata.platform && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {technique.metadata.platform.map((platform) => (
                    <span
                      key={platform}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    >
                      {platform}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
});

// Display name for debugging
TechniqueCard.displayName = 'TechniqueCard';

export default TechniqueCard;

// Type exports for consumers
export type { TechniqueCardProps };