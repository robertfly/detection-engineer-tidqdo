// Dialog.tsx
// Version: 1.0.0
// A reusable dialog component implementing Material Design 3.0 specifications
// with enhanced animation, accessibility, and focus management capabilities.

import React, { useEffect, useRef, useCallback } from 'react';
import classNames from 'classnames'; // v2.3+
import { AnimatePresence, motion } from 'framer-motion'; // v10.0+
import { Button } from './Button';

// Interface for Dialog component props
export interface DialogProps {
  /** Controls dialog visibility state */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Dialog title text for header and accessibility */
  title: string;
  /** Dialog content message */
  message: string | React.ReactNode;
  /** Text for confirm button */
  confirmLabel?: string;
  /** Text for cancel button */
  cancelLabel?: string;
  /** Callback for confirm action */
  onConfirm?: () => void;
  /** Dialog visual variant */
  variant?: 'info' | 'warning' | 'error' | 'success';
  /** Additional CSS classes */
  className?: string;
  /** Optional ref for initial focus */
  initialFocus?: React.RefObject<HTMLElement>;
}

// Custom hook for keyboard interactions and focus management
const useDialogKeyboard = (
  onClose: () => void,
  dialogRef: React.RefObject<HTMLElement>
) => {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Handle escape key press
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }

      // Trap focus within dialog
      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0] as HTMLElement;
        const lastFocusable = focusableElements[
          focusableElements.length - 1
        ] as HTMLElement;

        if (event.shiftKey && document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        } else if (!event.shiftKey && document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the dialog or initial focus element
    if (dialogRef.current) {
      (dialogRef.current.querySelector('button') as HTMLElement)?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on unmount
      previousActiveElement.current?.focus();
    };
  }, [onClose, dialogRef]);
};

/**
 * Enhanced dialog component with animation and accessibility features
 */
const Dialog: React.FC<DialogProps> = React.memo(({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'info',
  className,
  initialFocus,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Initialize keyboard handling and focus management
  useDialogKeyboard(onClose, dialogRef);

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Variant-specific styles
  const variantStyles = {
    info: 'border-blue-200',
    warning: 'border-yellow-200',
    error: 'border-red-200',
    success: 'border-green-200',
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleOverlayClick}
            aria-hidden="true"
          />

          {/* Dialog positioning */}
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Dialog content */}
            <motion.div
              ref={dialogRef}
              className={classNames(
                'relative w-full max-w-md rounded-lg bg-white shadow-xl',
                'transform overflow-hidden',
                variantStyles[variant],
                className
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
              aria-describedby="dialog-description"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{
                duration: 0.2,
                type: 'spring',
                damping: 25,
              }}
            >
              {/* Header */}
              <div className="border-b border-gray-200 px-6 py-4">
                <h2
                  id="dialog-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  {title}
                </h2>
              </div>

              {/* Content */}
              <div
                id="dialog-description"
                className="px-6 py-4"
              >
                {typeof message === 'string' ? (
                  <p className="text-sm text-gray-500">{message}</p>
                ) : (
                  message
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <Button
                  variant="tertiary"
                  onClick={onClose}
                  aria-label={cancelLabel}
                >
                  {cancelLabel}
                </Button>
                {onConfirm && (
                  <Button
                    variant="primary"
                    onClick={onConfirm}
                    aria-label={confirmLabel}
                  >
                    {confirmLabel}
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

Dialog.displayName = 'Dialog';

export default Dialog;