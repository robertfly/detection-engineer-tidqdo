import React from 'react'; // v18.2.0
import clsx from 'clsx'; // v2.0.0
import { Theme } from '../../config/theme';
import '../../styles/components.css';

/**
 * Props interface for the Badge component following Material Design 3.0 guidelines
 */
interface BadgeProps {
  /** Content to be wrapped by the badge */
  children: React.ReactNode;
  /** Visual style variant following Material Design color system */
  variant?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  /** Size of the badge with responsive scaling */
  size?: 'small' | 'medium' | 'large';
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Numeric value to display inside badge */
  count?: number;
  /** Renders badge as a dot indicator */
  dot?: boolean;
  /** Renders badge with outlined style */
  outlined?: boolean;
  /** Maximum number before showing overflow indicator */
  maxCount?: number;
  /** Controls visibility when count is zero */
  showZero?: boolean;
  /** Hides the badge while keeping space */
  invisible?: boolean;
  /** Enables badge overlap positioning */
  overlap?: boolean;
}

/**
 * A reusable Badge component that displays a small label, status indicator, or count
 * following Material Design 3.0 guidelines with enhanced accessibility features.
 *
 * @component
 * @example
 * ```tsx
 * <Badge count={5} variant="primary">
 *   <NotificationIcon />
 * </Badge>
 * ```
 */
const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  className,
  count,
  dot = false,
  outlined = false,
  maxCount = 99,
  showZero = false,
  invisible = false,
  overlap = false,
}) => {
  // Determine if badge content should be visible
  const shouldShowBadge = () => {
    if (invisible) return false;
    if (dot) return true;
    if (typeof count === 'number') {
      return count > 0 || showZero;
    }
    return true;
  };

  // Format count display value
  const getDisplayCount = () => {
    if (typeof count !== 'number') return '';
    return count > maxCount ? `${maxCount}+` : count.toString();
  };

  // Compute badge content
  const badgeContent = dot ? null : getDisplayCount();

  // Build CSS classes
  const badgeClasses = clsx(
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    {
      'badge--dot': dot,
      'badge--outlined': outlined,
      'badge--invisible': !shouldShowBadge(),
      'badge--overlap': overlap,
      'badge--with-content': Boolean(badgeContent),
    },
    className
  );

  // Compute ARIA attributes
  const ariaAttributes = {
    'aria-hidden': invisible || (!badgeContent && !dot),
    role: 'status',
    ...(typeof count === 'number' && {
      'aria-label': `${count} notifications`,
      'aria-live': 'polite',
    }),
  };

  return (
    <div className="badge-wrapper">
      {children}
      {shouldShowBadge() && (
        <span
          className={badgeClasses}
          {...ariaAttributes}
          data-testid="badge"
        >
          {badgeContent}
        </span>
      )}
    </div>
  );
};

// Add display name for debugging
Badge.displayName = 'Badge';

export default Badge;

// CSS Module styles (to be added to components.css)
const styles = `
/* Badge Base Styles */
.badge-wrapper {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
  flex-shrink: 0;
}

.badge {
  position: absolute;
  display: flex;
  flex-flow: row wrap;
  place-content: center;
  align-items: center;
  box-sizing: border-box;
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  transition: transform var(--transition-normal);
  transform-origin: 100% 0%;
  z-index: var(--z-index-badge, 1);
}

/* Size Variants */
.badge--small {
  height: 16px;
  min-width: 16px;
  padding: 0 4px;
  font-size: var(--font-size-xs);
  border-radius: 8px;
}

.badge--medium {
  height: 20px;
  min-width: 20px;
  padding: 0 6px;
  font-size: var(--font-size-sm);
  border-radius: 10px;
}

.badge--large {
  height: 24px;
  min-width: 24px;
  padding: 0 8px;
  font-size: var(--font-size-base);
  border-radius: 12px;
}

/* Dot Variant */
.badge--dot {
  height: 8px;
  min-width: 8px;
  padding: 0;
  border-radius: 4px;
}

/* Color Variants */
.badge--primary {
  background-color: var(--primary-color);
  color: white;
}

.badge--secondary {
  background-color: var(--secondary-color);
  color: white;
}

.badge--error {
  background-color: var(--error-color);
  color: white;
}

.badge--warning {
  background-color: var(--warning-color);
  color: var(--high-contrast-text);
}

.badge--info {
  background-color: var(--info-color);
  color: white;
}

.badge--success {
  background-color: var(--success-color);
  color: white;
}

/* Outlined Variant */
.badge--outlined {
  background-color: transparent;
  border: 2px solid currentColor;
}

/* Position Modifiers */
.badge:not(.badge--overlap) {
  top: 0;
  right: 0;
  transform: scale(1) translate(50%, -50%);
}

.badge--overlap {
  top: 16%;
  right: 16%;
  transform: scale(1) translate(50%, -50%);
}

/* Visibility */
.badge--invisible {
  transform: scale(0) translate(50%, -50%);
}

/* High Contrast Mode Support */
@media (forced-colors: active) {
  .badge {
    border: 1px solid ButtonText;
    forced-color-adjust: none;
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .badge {
    transition: none;
  }
}

/* RTL Support */
[dir="rtl"] .badge {
  right: auto;
  left: 0;
  transform-origin: 0% 0%;
}

/* Print Styles */
@media print {
  .badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;