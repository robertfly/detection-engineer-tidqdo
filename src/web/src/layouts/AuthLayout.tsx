import React from 'react'; // v18.2.0
import Card from '../components/common/Card';
import logoDark from '../assets/images/logo-dark.png';
import logoLight from '../assets/images/logo-light.png';
import { useTheme } from '../hooks/useTheme';

/**
 * Props interface for the AuthLayout component
 */
export interface AuthLayoutProps {
  /** Content to be rendered inside the layout */
  children: React.ReactNode;
  /** Page title for accessibility and SEO */
  title: string;
  /** Optional test ID for testing */
  testId?: string;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * AuthLayout component provides a consistent, theme-aware layout for authentication pages
 * Implements Material Design 3.0 specifications and WCAG 2.1 AA compliance
 */
export const AuthLayout: React.FC<AuthLayoutProps> = React.memo(({
  children,
  title,
  testId = 'auth-layout',
  className
}) => {
  // Get current theme context
  const { isDarkMode } = useTheme();

  /**
   * Logo error handler with fallback
   */
  const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Logo failed to load:', e);
    e.currentTarget.src = isDarkMode ? logoLight : logoDark; // Fallback to opposite theme
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 transition-colors duration-200 ${className || ''}`}
      data-testid={testId}
    >
      {/* Logo with theme awareness and optimization */}
      <img
        src={isDarkMode ? logoDark : logoLight}
        alt="AI Detection Platform Logo"
        className="mb-8 h-12 w-auto object-contain select-none"
        loading="eager"
        onError={handleLogoError}
        aria-hidden="true"
        role="presentation"
      />

      {/* Accessible title */}
      {title && (
        <h1 
          className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 text-center transition-colors duration-200"
          id="auth-page-title"
        >
          {title}
        </h1>
      )}

      {/* Card container with proper spacing and elevation */}
      <Card
        className="w-full max-w-md mx-auto shadow-lg transition-shadow duration-200"
        elevation={2}
        variant="default"
        role="main"
        aria-labelledby="auth-page-title"
      >
        {children}
      </Card>

      {/* Skip link for keyboard navigation */}
      <a
        href="#auth-page-title"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:p-2 focus:bg-primary-500 focus:text-white focus:rounded"
      >
        Skip to main content
      </a>
    </div>
  );
});

// Display name for debugging
AuthLayout.displayName = 'AuthLayout';

export default AuthLayout;