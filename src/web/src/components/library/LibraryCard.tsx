import React from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0
import Card from '../common/Card';
import Badge from '../common/Badge';
import ErrorBoundary from '../common/ErrorBoundary';
import { Library } from '../../types/library';

/**
 * Props interface for LibraryCard component
 */
interface LibraryCardProps {
  /** Library data object */
  library: Library;
  /** Click handler for card interaction */
  onClick?: (library: Library) => void;
  /** Additional CSS classes */
  className?: string;
  /** Loading state indicator */
  loading?: boolean;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Custom hook for tracking library card interactions
 */
const useLibraryCardAnalytics = (library: Library) => {
  const trackView = React.useCallback(() => {
    // Analytics implementation would go here
    console.debug('Library card viewed:', library.id);
  }, [library.id]);

  const trackClick = React.useCallback(() => {
    // Analytics implementation would go here
    console.debug('Library card clicked:', library.id);
  }, [library.id]);

  return { trackView, trackClick };
};

/**
 * Determines badge properties based on library visibility
 */
const getVisibilityBadgeProps = (visibility: Library['visibility']) => {
  const config = {
    private: {
      variant: 'warning' as const,
      text: 'Private',
      icon: 'lock'
    },
    organization: {
      variant: 'info' as const,
      text: 'Organization',
      icon: 'business'
    },
    public: {
      variant: 'success' as const,
      text: 'Public',
      icon: 'public'
    }
  };

  return config[visibility] || config.private;
};

/**
 * LibraryCard component - Displays library information in a Material Design 3.0 card
 * with accessibility features and theme support
 */
const LibraryCard: React.FC<LibraryCardProps> = React.memo(({
  library,
  onClick,
  className,
  loading = false,
  testId = 'library-card'
}) => {
  // Analytics hooks
  const { trackView, trackClick } = useLibraryCardAnalytics(library);

  // Memoized badge configuration
  const badgeProps = React.useMemo(() => 
    getVisibilityBadgeProps(library.visibility),
    [library.visibility]
  );

  // Handle click events
  const handleClick = React.useCallback(() => {
    if (!loading && onClick) {
      trackClick();
      onClick(library);
    }
  }, [loading, onClick, library, trackClick]);

  // Handle keyboard events
  const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (!loading && onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      handleClick();
    }
  }, [loading, onClick, handleClick]);

  // Track view on mount
  React.useEffect(() => {
    trackView();
  }, [trackView]);

  // Format detection count
  const detectionCount = library.settings?.detectionCount || 0;
  const formattedCount = new Intl.NumberFormat().format(detectionCount);

  return (
    <ErrorBoundary>
      <Card
        variant="outlined"
        interactive={Boolean(onClick)}
        className={classNames(
          'library-card',
          {
            'library-card--loading': loading,
            'library-card--interactive': Boolean(onClick)
          },
          className
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`${library.name} library with ${formattedCount} detections`}
        aria-busy={loading}
        data-testid={testId}
      >
        <div className={styles.container}>
          <div className={styles.header}>
            <h3 className={styles.title}>{library.name}</h3>
            <Badge
              variant={badgeProps.variant}
              className="library-card__badge"
            >
              {badgeProps.text}
            </Badge>
          </div>

          <p className={styles.description}>
            {library.description}
          </p>

          <div className={styles.footer}>
            <span className={styles.count}>
              {formattedCount} {detectionCount === 1 ? 'detection' : 'detections'}
            </span>
            <time
              dateTime={library.updatedAt}
              className="text-sm text-gray-500 dark:text-gray-400"
            >
              Updated {new Date(library.updatedAt).toLocaleDateString()}
            </time>
          </div>
        </div>
      </Card>
    </ErrorBoundary>
  );
});

// Component display name for debugging
LibraryCard.displayName = 'LibraryCard';

// Styles object matching the JSON specification
const styles = {
  container: classNames(
    'p-4',
    'flex flex-col gap-3',
    'motion-safe:transition-all',
    'focus-visible:ring-2',
    'focus-visible:ring-primary-500'
  ),
  header: classNames(
    'flex justify-between items-start',
    'gap-4'
  ),
  title: classNames(
    'text-lg font-semibold',
    'text-gray-900 dark:text-gray-100',
    'line-clamp-1'
  ),
  description: classNames(
    'text-sm text-gray-600 dark:text-gray-300',
    'line-clamp-2',
    'mt-1'
  ),
  footer: classNames(
    'flex justify-between items-center',
    'mt-2',
    'gap-2'
  ),
  count: classNames(
    'text-sm text-gray-500 dark:text-gray-400',
    'tabular-nums'
  )
};

export default LibraryCard;