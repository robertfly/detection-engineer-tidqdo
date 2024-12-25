import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'; // v10.0+
import styled from '@emotion/styled'; // v11.0+
import { 
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close as CloseIcon
} from '@mui/icons-material'; // v5.0.0+
import { palette, spacing, direction } from '../../config/theme';

// Interface definitions
export interface ToastProps {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onDismiss: (id: string) => void;
  important?: boolean;
  ariaLabel?: string;
  role?: 'alert' | 'status';
}

// Styled components
const ToastContainer = styled(motion.div)<{ variant: string }>`
  min-width: 300px;
  max-width: 400px;
  padding: ${spacing(2)};
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: ${spacing(1)};
  background-color: ${palette.background.paper};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  outline: none;
  position: relative;
  z-index: ${({ theme }) => theme.zIndex?.toast || 1400};
  direction: ${direction};

  ${({ variant, theme }) => `
    border-left: ${direction === 'ltr' ? `4px solid ${palette[variant].main}` : 'none'};
    border-right: ${direction === 'rtl' ? `4px solid ${palette[variant].main}` : 'none'};
    color: ${palette.text.primary};
  `}

  &:focus {
    outline: 2px solid ${palette.primary.main};
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  color: ${({ color }) => color};
  flex-shrink: 0;
`;

const Message = styled.span`
  flex-grow: 1;
  font-family: ${({ theme }) => theme.typography?.fontFamily};
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0 ${spacing(1)};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: ${spacing(0.5)};
  cursor: pointer;
  color: ${palette.text.secondary};
  border-radius: 50%;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.04);
  }

  &:focus {
    outline: 2px solid ${palette.primary.main};
    outline-offset: 2px;
  }

  @media (prefers-color-scheme: dark) {
    &:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }
  }
`;

// Variant configurations
const variantConfig = {
  success: {
    icon: CheckCircleIcon,
    color: palette.success.main,
    defaultRole: 'status'
  },
  error: {
    icon: ErrorIcon,
    color: palette.error.main,
    defaultRole: 'alert'
  },
  warning: {
    icon: WarningIcon,
    color: palette.warning.main,
    defaultRole: 'alert'
  },
  info: {
    icon: InfoIcon,
    color: palette.info.main,
    defaultRole: 'status'
  }
};

// Animation configurations
const toastAnimations = {
  initial: { opacity: 0, y: 50, scale: 0.3 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }
  },
  exit: {
    opacity: 0,
    scale: 0.5,
    transition: {
      duration: 0.2,
      ease: 'easeOut'
    }
  }
};

// Main component
export const Toast: React.FC<ToastProps> = React.memo(({
  id,
  message,
  variant,
  duration = 5000,
  onDismiss,
  important = false,
  ariaLabel,
  role
}) => {
  const shouldReduceMotion = useReducedMotion();
  const toastRef = useRef<HTMLDivElement>(null);
  const dismissTimeout = useRef<NodeJS.Timeout>();
  const { icon: VariantIcon, color, defaultRole } = variantConfig[variant];

  // Handle auto-dismissal
  useEffect(() => {
    if (!important && duration > 0) {
      dismissTimeout.current = setTimeout(() => {
        onDismiss(id);
      }, duration);
    }

    return () => {
      if (dismissTimeout.current) {
        clearTimeout(dismissTimeout.current);
      }
    };
  }, [id, duration, onDismiss, important]);

  // Handle keyboard interactions
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && toastRef.current?.contains(document.activeElement)) {
        onDismiss(id);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [id, onDismiss]);

  // Handle dismiss click
  const handleDismissClick = useCallback(() => {
    onDismiss(id);
  }, [id, onDismiss]);

  // Focus management
  useEffect(() => {
    if (important) {
      toastRef.current?.focus();
    }
  }, [important]);

  return (
    <AnimatePresence>
      <ToastContainer
        ref={toastRef}
        variant={variant}
        role={role || defaultRole}
        aria-label={ariaLabel || message}
        tabIndex={0}
        initial={shouldReduceMotion ? { opacity: 0 } : toastAnimations.initial}
        animate={shouldReduceMotion ? { opacity: 1 } : toastAnimations.animate}
        exit={shouldReduceMotion ? { opacity: 0 } : toastAnimations.exit}
        layout
      >
        <IconWrapper color={color}>
          <VariantIcon fontSize="small" />
        </IconWrapper>
        
        <Message>{message}</Message>
        
        <CloseButton
          onClick={handleDismissClick}
          aria-label="Dismiss notification"
          type="button"
        >
          <CloseIcon fontSize="small" />
        </CloseButton>
      </ToastContainer>
    </AnimatePresence>
  );
});

Toast.displayName = 'Toast';

export default Toast;