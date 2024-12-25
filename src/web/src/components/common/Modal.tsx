// Modal.tsx
// Version: 1.0.0
// A highly optimized, accessible modal component implementing Material Design 3.0
// specifications with advanced animation and focus management capabilities.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames'; // v2.3+
import { AnimatePresence, motion } from 'framer-motion'; // v10.0+
import { Button } from './Button';

// Animation variants following Material Design 3.0 motion specifications
const variants = {
  overlay: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  scale: {
    hidden: { scale: 0.95, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
  },
  slide: {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
};

// Animation configuration
const transition = {
  duration: 0.2,
  ease: [0.2, 0, 0, 1], // Material Design standard easing
};

// Size configuration with responsive values
const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-full',
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | React.ReactNode;
  children: React.ReactNode;
  size?: keyof typeof sizeClasses;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  className?: string;
  overlayClassName?: string;
  initialFocus?: React.RefObject<HTMLElement>;
  motionPreset?: 'scale' | 'slide' | 'fade';
}

/**
 * Enhanced focus trap hook for managing focus within the modal
 */
const useFocusTrap = (isOpen: boolean, initialFocus?: React.RefObject<HTMLElement>) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store current focus
      previousFocus.current = document.activeElement as HTMLElement;

      // Set initial focus
      if (initialFocus?.current) {
        initialFocus.current.focus();
      } else if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }
    } else if (previousFocus.current) {
      // Restore previous focus on close
      previousFocus.current.focus();
    }
  }, [isOpen, initialFocus]);

  return modalRef;
};

/**
 * Enhanced keyboard interaction hook
 */
const useModalKeyboard = (onClose: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
};

/**
 * Modal component with advanced animation and accessibility features
 */
const Modal: React.FC<ModalProps> = React.memo(({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
  className,
  overlayClassName,
  initialFocus,
  motionPreset = 'scale',
}) => {
  // Client-side only rendering for SSR compatibility
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  // Focus management
  const modalRef = useFocusTrap(isOpen, initialFocus);

  // Keyboard interactions
  useModalKeyboard(onClose);

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Early return for SSR
  if (!isMounted) return null;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className={classNames(
            'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
            overlayClassName
          )}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={variants.overlay}
          transition={transition}
          onClick={handleOverlayClick}
          aria-modal="true"
          role="dialog"
          aria-labelledby="modal-title"
        >
          <motion.div
            ref={modalRef}
            className={classNames(
              'relative w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl',
              'p-6 overflow-y-auto max-h-[90vh]',
              sizeClasses[size],
              className
            )}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variants[motionPreset]}
            transition={transition}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 
                id="modal-title"
                className="text-xl font-semibold text-gray-900 dark:text-white"
              >
                {title}
              </h2>
              {showCloseButton && (
                <Button
                  variant="text"
                  size="small"
                  onClick={onClose}
                  ariaLabel="Close modal"
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="relative">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

Modal.displayName = 'Modal';

export default Modal;