// React v18.2.0
import React, { useState, useCallback, useEffect } from 'react';
// @emotion/styled v11.11.0
import styled from '@emotion/styled';
// @mui/material v5.14.0
import { useMediaQuery } from '@mui/material';

// Internal imports
import Sidebar from '../components/common/Sidebar';
import Header from '../components/layout/Header';
import SplitPane from '../components/workbench/SplitPane';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { useTheme } from '../../hooks/useTheme';

// Styled components with Material Design 3.0 specifications
const LayoutContainer = styled.div<{ isDarkMode: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
  background-color: ${({ isDarkMode }) => isDarkMode ? '#1E1E1E' : '#FFFFFF'};
  color: ${({ isDarkMode }) => isDarkMode ? '#FFFFFF' : '#2C3E50'};
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
`;

const MainContent = styled.main`
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
`;

const WorkbenchContainer = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

// Props interface
export interface WorkbenchLayoutProps {
  children?: React.ReactNode;
  className?: string;
  direction?: 'ltr' | 'rtl';
  onError?: (error: Error) => void;
  analyticsEnabled?: boolean;
}

/**
 * Main layout component for the AI Workbench interface with accessibility and performance optimizations
 */
const WorkbenchLayout: React.FC<WorkbenchLayoutProps> = React.memo(({
  children,
  className = '',
  direction = 'ltr',
  onError,
  analyticsEnabled = true
}) => {
  // Theme and responsive hooks
  const { isDarkMode } = useTheme();
  const isDesktop = useMediaQuery('(min-width: 1240px)');
  const isTablet = useMediaQuery('(min-width: 600px) and (max-width: 1239px)');

  // State management
  const [isSidebarOpen, setIsSidebarOpen] = useState(isDesktop);
  const [isNavigating, setIsNavigating] = useState(false);

  // Handle navigation state
  useEffect(() => {
    const handleNavigationStart = () => setIsNavigating(true);
    const handleNavigationEnd = () => setIsNavigating(false);

    window.addEventListener('beforeunload', handleNavigationStart);
    window.addEventListener('load', handleNavigationEnd);

    return () => {
      window.removeEventListener('beforeunload', handleNavigationStart);
      window.removeEventListener('load', handleNavigationEnd);
    };
  }, []);

  // Handle sidebar toggle
  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  // Handle error boundary errors
  const handleError = useCallback((error: Error) => {
    console.error('WorkbenchLayout Error:', error);
    onError?.(error);

    // Track error in analytics if enabled
    if (analyticsEnabled) {
      // Analytics implementation would go here
    }
  }, [onError, analyticsEnabled]);

  // Update sidebar state on screen size changes
  useEffect(() => {
    setIsSidebarOpen(isDesktop);
  }, [isDesktop]);

  return (
    <ErrorBoundary onError={handleError}>
      <LayoutContainer
        isDarkMode={isDarkMode}
        className={className}
        dir={direction}
        role="main"
        aria-label="Workbench Layout"
      >
        <Header
          onMenuClick={handleSidebarToggle}
          direction={direction}
        />

        <MainContent>
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            direction={direction}
          >
            {/* Sidebar content would be implemented here */}
          </Sidebar>

          <WorkbenchContainer>
            <ErrorBoundary
              onError={handleError}
              fallback={
                <div role="alert" className="error-fallback">
                  An error occurred in the workbench. Please try refreshing the page.
                </div>
              }
            >
              <SplitPane
                direction="horizontal"
                defaultSplit={50}
                minSize={200}
                persist={true}
                onChange={(split) => {
                  // Handle split change
                  if (analyticsEnabled) {
                    // Analytics implementation would go here
                  }
                }}
              />
            </ErrorBoundary>
          </WorkbenchContainer>
        </MainContent>

        {/* Loading indicator for navigation */}
        {isNavigating && (
          <div
            role="progressbar"
            aria-label="Navigation in progress"
            className="navigation-progress"
          />
        )}
      </LayoutContainer>
    </ErrorBoundary>
  );
});

// Display name for debugging
WorkbenchLayout.displayName = 'WorkbenchLayout';

export default WorkbenchLayout;