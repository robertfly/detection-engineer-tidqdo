// Button.tsx
// Version: 1.0.0
// A reusable button component implementing Material Design 3.0 specifications
// with comprehensive accessibility features and loading states.

import React, { useEffect, useCallback, useRef } from 'react';
import classnames from 'classnames'; // v2.3+
import Loading from './Loading';

// Button variants following Material Design 3.0
const VARIANTS = {
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  text: 'text',
} as const;

// Button sizes with touch target compliance
const SIZES = {
  small: 'small',
  medium: 'medium',
  large: 'large',
} as const;

// Default loading timeout (30 seconds)
const LOADING_TIMEOUT_DEFAULT = 30000;

// Minimum touch target size for accessibility (44px)
const MIN_TOUCH_TARGET_SIZE = 44;

// Type definitions
type VariantType = typeof VARIANTS[keyof typeof VARIANTS];
type SizeType = typeof SIZES[keyof typeof SIZES];

export interface ButtonProps {
  /** Button content */
  children: React.ReactNode;
  /** Visual style variant */
  variant?: VariantType;
  /** Button size */
  size?: SizeType;
  /** Additional CSS classes */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Button type attribute */
  type?: 'button' | 'submit' | 'reset';
  /** Click handler */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Accessible label */
  ariaLabel?: string;
  /** ARIA role override */
  role?: string;
  /** Loading state timeout in milliseconds */
  loadingTimeout?: number;
  /** Callback when loading timeout is reached */
  onLoadingTimeout?: () => void;
}

/**
 * Enhanced button component following Material Design 3.0 specifications
 * with comprehensive accessibility features and loading states.
 */
const Button: React.FC<ButtonProps> = ({
  children,
  variant = VARIANTS.primary,
  size = SIZES.medium,
  className,
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  onClick,
  ariaLabel,
  role,
  loadingTimeout = LOADING_TIMEOUT_DEFAULT,
  onLoadingTimeout,
}) => {
  // Refs for timeout handling
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Handle loading timeout
  useEffect(() => {
    if (loading && loadingTimeout && onLoadingTimeout) {
      timeoutRef.current = setTimeout(onLoadingTimeout, loadingTimeout);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [loading, loadingTimeout, onLoadingTimeout]);

  // Click handler with error boundary
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled && !loading && onClick) {
        try {
          onClick(event);
        } catch (error) {
          console.error('Button click handler error:', error);
        }
      }
    },
    [disabled, loading, onClick]
  );

  // Dynamic class generation
  const buttonClasses = classnames(
    // Base classes
    'button',
    'inline-flex',
    'items-center',
    'justify-center',
    'font-medium',
    'rounded',
    'transition-all',
    'duration-200',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-2',
    'transform-gpu',
    
    // Variant classes
    {
      // Primary variant
      'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500':
        variant === VARIANTS.primary,
      
      // Secondary variant
      'bg-secondary-100 text-secondary-900 hover:bg-secondary-200 focus:ring-secondary-500':
        variant === VARIANTS.secondary,
      
      // Tertiary variant
      'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-500':
        variant === VARIANTS.tertiary,
      
      // Text variant
      'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500':
        variant === VARIANTS.text,
      
      // States
      'opacity-50 cursor-not-allowed': disabled,
      'cursor-wait': loading,
      'w-full': fullWidth,
    },
    
    // Size classes
    {
      'text-sm px-3 py-2 min-h-[32px]': size === SIZES.small,
      'text-base px-4 py-2 min-h-[40px]': size === SIZES.medium,
      'text-lg px-6 py-3 min-h-[48px]': size === SIZES.large,
    },
    
    className
  );

  // Loading indicator size mapping
  const loadingSize = {
    [SIZES.small]: 16,
    [SIZES.medium]: 20,
    [SIZES.large]: 24,
  }[size];

  return (
    <button
      type={type}
      className={buttonClasses}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      role={role}
      style={{
        // Ensure minimum touch target size
        minWidth: Math.max(MIN_TOUCH_TARGET_SIZE, 0),
        minHeight: Math.max(MIN_TOUCH_TARGET_SIZE, 0),
      }}
    >
      {loading ? (
        <>
          <Loading
            size={loadingSize}
            variant="spinner"
            className="mr-2"
            label="Loading"
          />
          <span className="opacity-75">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;