// React v18.2.0+
import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import { useTheme } from '@mui/material';

// Internal imports
import Navigation from '../components/layout/Navigation';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import ErrorBoundary from '../components/common/ErrorBoundary';

// Default layout configuration
const DEFAULT_CONFIG = {
  navigationWidth: 280,
  headerHeight: 64,
  footerHeight: 80,
  transitionDuration: 200
} as const;

// Styled components with Material Design 3.0 specifications
const LayoutContainer = styled.div<{ isDarkMode: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
  background-color: ${({ isDarkMode }) => isDarkMode ? '#1E1E1E' : '#FFFFFF'};
  color: ${({ isDarkMode }) => isDarkMode ? '#FFFFFF' : '#2C3E50'};
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
`;

const MainContent = styled.main<{ config: typeof DEFAULT_CONFIG }>`
  display: flex;
  flex: 1;
  margin-top: ${({ config }) => config.headerHeight}px;
  transition: margin-left ${({ config }) => config.transitionDuration}ms ease;

  @media (min-width: 1240px) {
    margin-left: ${({ config }) => config.navigationWidth}px;
  }
`;

const ContentArea = styled.div<{ hasError?: boolean }>`
  flex: 1;
  overflow: auto;
  padding: 24px;
  position: relative;
  transition: padding 0.2s ease;
  
  ${({ hasError }) => hasError && `
    display: flex;
    align-items: center;
    justify-content: center;
  `}

  @media (max-width: 599px) {
    padding: 16px;
  }
`;

// Props interface
export interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
  disableErrorBoundary?: boolean;
  customNavigation?: React.ReactNode;
  layoutConfig?: Partial<typeof DEFAULT_CONFIG>;
}

/**
 * Main dashboard layout component implementing Material Design 3.0 specifications
 * with responsive behavior and accessibility features
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  className = '',
  disableErrorBoundary = false,
  customNavigation,
  layoutConfig = {}
}) => {
  // Theme and state management
  const theme = useTheme();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Merge default config with custom config
  const config = {
    ...DEFAULT_CONFIG,
    ...layoutConfig
  };

  // Handle navigation toggle
  const handleNavigationToggle = useCallback(() => {
    setIsNavigationOpen(prev => !prev);
  }, []);

  // Handle error boundary errors
  const handleError = useCallback((error: Error) => {
    console.error('DashboardLayout Error:', error);
    setHasError(true);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isNavigationOpen) {
        setIsNavigationOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isNavigationOpen]);

  // Focus management for accessibility
  useEffect(() => {
    if (hasError && mainContentRef.current) {
      mainContentRef.current.focus();
    }
  }, [hasError]);

  // Wrap content with error boundary if enabled
  const wrappedContent = disableErrorBoundary ? children : (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  );

  return (
    <LayoutContainer
      isDarkMode={theme.palette.mode === 'dark'}
      className={className}
      role="application"
      aria-label="Dashboard Layout"
    >
      <Header
        onMenuClick={handleNavigationToggle}
        className="fixed top-0 left-0 right-0 z-30"
      />

      {customNavigation || (
        <Navigation
          isOpen={isNavigationOpen}
          onClose={() => setIsNavigationOpen(false)}
          ariaLabel="Main Navigation"
        />
      )}

      <MainContent
        ref={mainContentRef}
        config={config}
        role="main"
        tabIndex={-1}
        aria-label="Main Content"
      >
        <ContentArea hasError={hasError}>
          {wrappedContent}
        </ContentArea>
      </MainContent>

      <Footer
        className="mt-auto"
        showSocial={false}
      />
    </LayoutContainer>
  );
};

// Display name for debugging
DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;