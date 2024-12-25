// Loading.tsx
// Version: 1.0.0
// A reusable loading indicator component with hardware-accelerated animations
// and accessibility features following Material Design 3.0 specifications.

import React, { useEffect, useState } from 'react';
import classNames from 'classnames'; // v2.3+
import {
  'loading-spinner': spinnerClass,
  'loading-spinner--small': spinnerSmall,
  'loading-spinner--medium': spinnerMedium,
  'loading-spinner--large': spinnerLarge,
  pulse,
  'pulse--reduced-motion': pulseReducedMotion,
  shimmer,
  'shimmer--reduced-motion': shimmerReducedMotion,
} from '../../styles/animations.css';

// Type definitions for component props
interface LoadingProps {
  /**
   * Size of loading indicator
   * - small: 16px
   * - medium: 24px
   * - large: 32px
   * - number: custom size in pixels
   */
  size?: 'small' | 'medium' | 'large' | number;
  
  /**
   * Visual style of loading indicator
   * - spinner: Rotating circular indicator
   * - pulse: Fading opacity animation
   * - shimmer: Linear gradient sweep
   */
  variant?: 'spinner' | 'pulse' | 'shimmer';
  
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
  
  /**
   * Accessible label for screen readers
   */
  label?: string;
  
  /**
   * Centers loading indicator in container using CSS Grid
   */
  center?: boolean;
}

/**
 * Loading indicator component with hardware-accelerated animations
 * and accessibility features.
 */
const Loading: React.FC<LoadingProps> = ({
  size = 'medium',
  variant = 'spinner',
  className,
  label = 'Loading...',
  center = false,
}) => {
  // Track if animations should be enabled (for SSR hydration)
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Determine size class or custom size style
  const getSizeClass = () => {
    if (typeof size === 'number') {
      return { '--loading-size': `${size}px` } as React.CSSProperties;
    }
    
    switch (size) {
      case 'small':
        return spinnerSmall;
      case 'large':
        return spinnerLarge;
      default:
        return spinnerMedium;
    }
  };

  // Get animation class based on variant
  const getAnimationClass = () => {
    switch (variant) {
      case 'pulse':
        return pulse;
      case 'shimmer':
        return shimmer;
      default:
        return spinnerClass;
    }
  };

  // Combine all classes
  const containerClasses = classNames(
    'loading-container',
    {
      'grid place-items-center': center,
      'opacity-0': !isClient, // Prevent flash during hydration
    },
    className
  );

  const loadingClasses = classNames(
    getAnimationClass(),
    getSizeClass(),
    'inline-block', // Ensure proper sizing
    'transform-gpu', // Force hardware acceleration
  );

  return (
    <div className={containerClasses} role="status">
      <div 
        className={loadingClasses}
        aria-valuetext={label}
        aria-busy="true"
        style={typeof size === 'number' ? getSizeClass() : undefined}
      >
        {/* Hidden text for screen readers */}
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
};

export default Loading;