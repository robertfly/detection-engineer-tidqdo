// @ts-check
import React from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0

/**
 * Available card variants following Material Design 3.0 specifications
 */
export const VARIANTS = {
  default: 'default',
  outlined: 'outlined',
  filled: 'filled'
} as const;

/**
 * Elevation levels for card shadow depth
 */
export const ELEVATIONS = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
} as const;

type VariantType = typeof VARIANTS[keyof typeof VARIANTS];
type ElevationType = typeof ELEVATIONS[keyof typeof ELEVATIONS];

/**
 * Props interface for the Card component
 * @interface
 */
export interface CardProps {
  /** Content to be rendered inside the card */
  children: React.ReactNode;
  /** Additional CSS classes to be applied */
  className?: string;
  /** Shadow elevation level (0-3) */
  elevation?: ElevationType;
  /** Visual variant of the card */
  variant?: VariantType;
  /** Whether the card is interactive (clickable) */
  interactive?: boolean;
  /** Whether the card should take full width of its container */
  fullWidth?: boolean;
  /** Click handler for interactive cards */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** ARIA role for accessibility */
  role?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

/**
 * Determines shadow classes based on elevation level and theme
 * @param {number} elevation - The elevation level (0-3)
 * @returns {string} Combined shadow classes
 */
const getElevationClasses = (elevation: number): string => {
  if (elevation < 0 || elevation > 3) {
    console.warn('Invalid elevation level. Using default elevation 0.');
    elevation = 0;
  }

  const shadowMap = {
    0: '',
    1: 'shadow-sm dark:shadow-gray-900/30',
    2: 'shadow-md dark:shadow-gray-900/40',
    3: 'shadow-lg dark:shadow-gray-900/50'
  };

  return shadowMap[elevation as keyof typeof shadowMap];
};

/**
 * Card component implementing Material Design 3.0 specifications
 * with support for different elevations, variants, and interactive states
 */
export const Card: React.FC<CardProps> = React.memo(({
  children,
  className,
  elevation = ELEVATIONS.none,
  variant = VARIANTS.default,
  interactive = false,
  fullWidth = false,
  onClick,
  ariaLabel,
  role = 'region',
  tabIndex,
}) => {
  // Base card classes
  const baseClasses = [
    'rounded-lg',
    'bg-white dark:bg-gray-800',
    'p-4',
    'transition-shadow duration-200',
    'transition-colors duration-200'
  ];

  // Interactive state classes
  const interactiveClasses = [
    'cursor-pointer',
    'hover:bg-gray-50 dark:hover:bg-gray-700',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-primary-500',
    'focus-visible:ring-2',
    'focus-visible:ring-primary-500'
  ];

  // Variant-specific classes
  const variantClasses = {
    [VARIANTS.default]: [],
    [VARIANTS.outlined]: ['border', 'border-gray-200 dark:border-gray-700'],
    [VARIANTS.filled]: ['bg-gray-50 dark:bg-gray-900']
  };

  // Combine all classes
  const cardClasses = classNames(
    baseClasses,
    getElevationClasses(elevation),
    variantClasses[variant],
    {
      [interactiveClasses.join(' ')]: interactive,
      'w-full': fullWidth
    },
    className
  );

  // Handle keyboard interaction for interactive cards
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (interactive && onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      className={cardClasses}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={role}
      aria-label={ariaLabel}
      tabIndex={interactive ? tabIndex ?? 0 : undefined}
      data-testid="card"
    >
      {children}
    </div>
  );
});

// Display name for debugging
Card.displayName = 'Card';

export default Card;