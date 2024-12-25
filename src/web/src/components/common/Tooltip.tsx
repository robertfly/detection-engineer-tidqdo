import React, { useState, useRef, useEffect, useCallback } from 'react';
import classNames from 'classnames'; // v2.3+
import { motion, AnimatePresence } from 'framer-motion'; // v10.0+
import { useDebounce } from 'use-debounce'; // v9.0+
import '../../styles/components.css';

// Position type for tooltip placement
type Position = 'top' | 'right' | 'bottom' | 'left';

// Interface for position calculation result
interface PositionResult {
  x: number;
  y: number;
  placement: Position;
}

// Props interface for the Tooltip component
export interface TooltipProps {
  /** The element that triggers the tooltip */
  children: React.ReactNode;
  /** Content to display in the tooltip */
  content: React.ReactNode;
  /** Preferred tooltip position */
  position?: Position;
  /** Delay in ms before showing tooltip */
  delay?: number;
  /** Additional CSS classes */
  className?: string;
  /** Distance between tooltip and trigger element */
  offset?: number;
  /** Disables tooltip when true */
  disabled?: boolean;
  /** Custom ID for ARIA attributes */
  id?: string;
}

/**
 * Calculates optimal tooltip position based on trigger element position,
 * viewport boundaries, and scroll position
 */
const calculatePosition = (
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  preferredPosition: Position
): PositionResult => {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.pageXOffset,
    scrollY: window.pageYOffset,
  };

  const positions: Record<Position, PositionResult> = {
    top: {
      x: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      y: triggerRect.top - tooltipRect.height - 8,
      placement: 'top',
    },
    right: {
      x: triggerRect.right + 8,
      y: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      placement: 'right',
    },
    bottom: {
      x: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
      y: triggerRect.bottom + 8,
      placement: 'bottom',
    },
    left: {
      x: triggerRect.left - tooltipRect.width - 8,
      y: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
      placement: 'left',
    },
  };

  // Check if preferred position fits in viewport
  const preferred = positions[preferredPosition];
  const isRTL = document.dir === 'rtl';

  // Apply RTL adjustments if needed
  if (isRTL) {
    positions.right.x = triggerRect.left - tooltipRect.width - 8;
    positions.left.x = triggerRect.right + 8;
  }

  // Check if preferred position fits in viewport
  if (
    preferred.x >= 0 &&
    preferred.x + tooltipRect.width <= viewport.width &&
    preferred.y >= 0 &&
    preferred.y + tooltipRect.height <= viewport.height
  ) {
    return preferred;
  }

  // Find best alternative position
  const alternatives: Position[] = ['top', 'right', 'bottom', 'left'];
  return (
    alternatives
      .map(pos => positions[pos])
      .find(pos => 
        pos.x >= 0 &&
        pos.x + tooltipRect.width <= viewport.width &&
        pos.y >= 0 &&
        pos.y + tooltipRect.height <= viewport.height
      ) || preferred // Fallback to preferred if no position fits
  );
};

/**
 * A reusable tooltip component that provides contextual information or hints
 * when hovering over UI elements. Implements Material Design 3.0 guidelines
 * with accessibility support.
 */
const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = 'top',
  delay = 200,
  className,
  offset = 8,
  disabled = false,
  id,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<PositionResult | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [debouncedVisible] = useDebounce(isVisible, delay);

  // Generate unique ID for ARIA attributes
  const tooltipId = id || `tooltip-${Math.random().toString(36).substr(2, 9)}`;

  // Update tooltip position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current || !isVisible) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const newPosition = calculatePosition(triggerRect, tooltipRect, position);
    setTooltipPosition(newPosition);
  }, [isVisible, position]);

  // Handle mouse events
  const handleMouseEnter = () => !disabled && setIsVisible(true);
  const handleMouseLeave = () => setIsVisible(false);

  // Handle focus events for keyboard navigation
  const handleFocus = () => !disabled && setIsVisible(true);
  const handleBlur = () => setIsVisible(false);

  // Update position on scroll/resize
  useEffect(() => {
    if (!isVisible) return;

    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isVisible, updatePosition]);

  // Initial position calculation
  useEffect(() => {
    if (debouncedVisible) {
      updatePosition();
    }
  }, [debouncedVisible, updatePosition]);

  // Animation variants
  const variants = {
    initial: (placement: Position) => ({
      opacity: 0,
      x: placement === 'left' ? -8 : placement === 'right' ? 8 : 0,
      y: placement === 'top' ? -8 : placement === 'bottom' ? 8 : 0,
    }),
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
    },
    exit: (placement: Position) => ({
      opacity: 0,
      x: placement === 'left' ? -8 : placement === 'right' ? 8 : 0,
      y: placement === 'top' ? -8 : placement === 'bottom' ? 8 : 0,
    }),
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={debouncedVisible ? tooltipId : undefined}
      className={classNames('tooltip-trigger', className)}
    >
      {children}
      <AnimatePresence>
        {debouncedVisible && tooltipPosition && (
          <motion.div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={classNames(
              'tooltip-content',
              `tooltip-${tooltipPosition.placement}`,
              {
                'theme-light': document.documentElement.getAttribute('data-theme') === 'light',
                'theme-dark': document.documentElement.getAttribute('data-theme') === 'dark',
              }
            )}
            style={{
              position: 'fixed',
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              zIndex: 'var(--z-index-tooltip)',
            }}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants}
            custom={tooltipPosition.placement}
            transition={{
              duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.2,
              ease: 'easeOut',
            }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Tooltip;