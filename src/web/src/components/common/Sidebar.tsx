// React v18.2.0+
import React, { useCallback, useEffect, useRef } from 'react';
// @emotion/styled v11.11.0
import styled from '@emotion/styled';
// react-responsive v8.0.0
import { useMediaQuery } from 'react-responsive';
// framer-motion v10.16.4
import { AnimatePresence, motion } from 'framer-motion';

// Internal imports
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, breakpoints, transitions } from '../../config/theme';

// Constants
const DESKTOP_BREAKPOINT = 1240;
const TABLET_BREAKPOINT = 600;
const SWIPE_THRESHOLD = 50;
const ANIMATION_DURATION = 0.3;

// Interfaces
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  ariaLabel?: string;
  role?: string;
}

// Styled components with theme support
const SidebarContainer = styled(motion.aside)<{ width: string; isDarkMode: boolean }>`
  position: fixed;
  height: 100vh;
  width: ${props => props.width};
  z-index: 40;
  background-color: ${props => props.isDarkMode ? colors.background.dark : colors.background.light};
  border-right: 1px solid ${props => props.isDarkMode ? colors.divider.dark : colors.divider.light};
  color: ${props => props.isDarkMode ? colors.text.dark.primary : colors.text.light.primary};
  transition: ${transitions.theme} !important;
  outline: none;
  will-change: transform;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;

  @media (min-width: ${DESKTOP_BREAKPOINT}px) {
    position: relative;
    transform: translateX(0);
  }

  @media (max-width: ${DESKTOP_BREAKPOINT - 1}px) {
    position: fixed;
    left: 0;
    top: 0;
  }

  @media (max-width: ${TABLET_BREAKPOINT - 1}px) {
    width: 100%;
    touch-action: pan-x;
  }
`;

const Overlay = styled(motion.div)<{ isDarkMode: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${props => 
    props.isDarkMode 
      ? 'rgba(0, 0, 0, 0.7)' 
      : 'rgba(0, 0, 0, 0.5)'
  };
  z-index: 30;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
`;

// Animation variants
const sidebarVariants = {
  open: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: ANIMATION_DURATION
    }
  },
  closed: {
    x: '-100%',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: ANIMATION_DURATION
    }
  }
};

const overlayVariants = {
  open: {
    opacity: 1,
    transition: { duration: ANIMATION_DURATION }
  },
  closed: {
    opacity: 0,
    transition: { duration: ANIMATION_DURATION }
  }
};

/**
 * Sidebar component with enhanced theme support and accessibility features
 * Implements responsive behavior and smooth transitions
 */
export const Sidebar = React.memo(({
  isOpen,
  onClose,
  children,
  width = '280px',
  ariaLabel = 'Navigation Sidebar',
  role = 'navigation'
}: SidebarProps) => {
  // Hooks
  const { isDarkMode } = useTheme();
  const isDesktop = useMediaQuery({ minWidth: DESKTOP_BREAKPOINT });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchMoveX = useRef<number>(0);

  // Handle keyboard events for accessibility
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen && !isDesktop) {
      onClose();
    }
  }, [isOpen, isDesktop, onClose]);

  // Handle touch events for mobile swipe
  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
    touchMoveX.current = event.touches[0].clientX;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    touchMoveX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeDistance = touchStartX.current - touchMoveX.current;
    if (swipeDistance > SWIPE_THRESHOLD && isOpen) {
      onClose();
    }
  };

  // Focus trap implementation
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || isDesktop) return;

    const focusableElements = sidebar.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0] as HTMLElement;
    const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleTabKey);
      firstFocusable?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen, isDesktop]);

  // Event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (!isDesktop && isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isDesktop]);

  return (
    <AnimatePresence mode="wait">
      {(isOpen || isDesktop) && (
        <>
          {!isDesktop && (
            <Overlay
              isDarkMode={isDarkMode}
              initial="closed"
              animate="open"
              exit="closed"
              variants={overlayVariants}
              onClick={onClose}
              aria-hidden="true"
            />
          )}
          <SidebarContainer
            ref={sidebarRef}
            width={width}
            isDarkMode={isDarkMode}
            initial="closed"
            animate="open"
            exit="closed"
            variants={sidebarVariants}
            aria-label={ariaLabel}
            role={role}
            aria-hidden={!isOpen && !isDesktop}
            aria-expanded={isOpen || isDesktop}
            tabIndex={-1}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {children}
          </SidebarContainer>
        </>
      )}
    </AnimatePresence>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;