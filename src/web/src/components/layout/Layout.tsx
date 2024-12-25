/**
 * Main layout component implementing Material Design 3.0 specifications
 * with enhanced accessibility, responsive behavior, and theme support.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '../../hooks/useTheme';

// Internal components
import Header from './Header';
import Navigation from './Navigation';
import Footer from './Footer';
import ErrorBoundary from '../common/ErrorBoundary';

// Styled components with Material Design 3.0 specifications
const LayoutContainer = styled.div<{ isDarkMode: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: ${({ isDarkMode }) => isDarkMode ? '#1E1E1E' : '#FFFFFF'};
  color: ${({ isDarkMode }) => isDarkMode ? '#FFFFFF' : '#2C3E50'};
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
`;

const MainContent = styled.main<{ isNavigationOpen: boolean }>`
  display: flex;
  flex: 1 1 auto;
  overflow: hidden;
  position: relative;
  margin-top: 64px;
  transition: padding-left 0.3s ease;

  @media (min-width: 1240px) {
    padding-left: ${({ isNavigationOpen }) => isNavigationOpen ? '280px' : '0'};
  }

  @media (max-width: 599px) {
    margin-top: 56px;
  }
`;

const ContentArea = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px;
  scroll-behavior: smooth;

  @media (max-width: 599px) {
    padding: 16px;
  }
`;

// Props interface
interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  customBreakpoint?: number;
  disableTransitions?: boolean;
  initialNavigationState?: boolean;
}

/**
 * Main layout component that wraps the application content with responsive behavior
 * and theme support following Material Design 3.0 specifications.
 */
const Layout: React.FC<LayoutProps> = React.memo(({
  children,
  className = '',
  customBreakpoint = 1240,
  disableTransitions = false,
  initialNavigationState
}) => {
  // Theme and responsive hooks
  const { isDarkMode } = useTheme();
  const isDesktop = useMediaQuery(`(min-width:${customBreakpoint}px)`);

  // Navigation state
  const [isNavigationOpen, setIsNavigationOpen] = useState(
    initialNavigationState ?? isDesktop
  );

  // Handle navigation toggle
  const handleNavigationToggle = useCallback(() => {
    setIsNavigationOpen(prev => !prev);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Toggle navigation with Ctrl + B
      if (event.ctrlKey && event.key === 'b') {
        event.preventDefault();
        handleNavigationToggle();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [handleNavigationToggle]);

  // Update navigation state on breakpoint changes
  useEffect(() => {
    if (initialNavigationState === undefined) {
      setIsNavigationOpen(isDesktop);
    }
  }, [isDesktop, initialNavigationState]);

  // Handle errors
  const handleError = useCallback((error: Error) => {
    console.error('Layout Error:', error);
    // Additional error handling logic would go here
  }, []);

  return (
    <ErrorBoundary onError={handleError}>
      <LayoutContainer 
        isDarkMode={isDarkMode}
        className={className}
        role="application"
        aria-label="Application layout"
      >
        <Header 
          onMenuClick={handleNavigationToggle}
          className={disableTransitions ? 'no-transitions' : ''}
        />

        <MainContent 
          isNavigationOpen={isNavigationOpen}
          className={disableTransitions ? 'no-transitions' : ''}
        >
          <Navigation
            isOpen={isNavigationOpen}
            onClose={() => setIsNavigationOpen(false)}
            ariaLabel="Main navigation"
            focusTrapOptions={{
              returnFocusOnDeactivate: true,
              escapeDeactivates: !isDesktop
            }}
          />

          <ContentArea
            role="main"
            aria-label="Main content"
            className={disableTransitions ? 'no-transitions' : ''}
          >
            <ErrorBoundary
              fallback={
                <div role="alert" className="error-fallback">
                  An error occurred while rendering the content.
                  Please try refreshing the page.
                </div>
              }
            >
              {children}
            </ErrorBoundary>
          </ContentArea>
        </MainContent>

        <Footer />
      </LayoutContainer>
    </ErrorBoundary>
  );
});

// Display name for debugging
Layout.displayName = 'Layout';

export default Layout;