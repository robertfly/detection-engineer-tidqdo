/**
 * Entry point for the AI-Driven Detection Engineering platform web application
 * Implements React 18 concurrent features, performance monitoring, and enhanced error handling
 * @version 1.0.0
 */

import React, { StrictMode, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { initializeMonitoring } from '@datadog/browser-rum';
import { ErrorBoundary } from 'react-error-boundary';
import { ThemeProvider } from '@mui/material';

// Internal imports
import App from './App';
import { store } from './store';
import './styles/global.css';

// Constants
const ROOT_ELEMENT_ID = 'root';
const MONITORING_CONFIG = {
  applicationId: process.env.VITE_DATADOG_APP_ID || '',
  clientToken: process.env.VITE_DATADOG_CLIENT_TOKEN || '',
  site: process.env.VITE_DATADOG_SITE || 'datadoghq.com',
  service: 'detection-platform-web',
  env: process.env.NODE_ENV,
  version: process.env.VITE_APP_VERSION || '1.0.0',
  trackInteractions: true,
  defaultPrivacyLevel: 'mask-user-input'
};

/**
 * Initializes performance monitoring in production environment
 */
const initializePerformanceMonitoring = (): void => {
  if (process.env.NODE_ENV === 'production') {
    initializeMonitoring({
      ...MONITORING_CONFIG,
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: true,
      beforeSend: (event) => {
        // Sanitize sensitive data before sending
        if (event.type === 'resource') {
          delete event.resource.url;
        }
        return event;
      }
    });
  }
};

/**
 * Error fallback component for the root error boundary
 */
const RootErrorFallback = ({ error }: { error: Error }): JSX.Element => (
  <div role="alert" className="p-4 m-4 bg-error-100 text-error-900 rounded-lg">
    <h1 className="text-xl font-semibold mb-2">Application Error</h1>
    <p className="mb-4">We apologize, but something went wrong. Please try refreshing the page.</p>
    <pre className="text-sm bg-error-50 p-2 rounded">
      {error.message}
    </pre>
    <button
      onClick={() => window.location.reload()}
      className="mt-4 px-4 py-2 bg-error-600 text-white rounded hover:bg-error-700 transition-colors"
    >
      Refresh Page
    </button>
  </div>
);

/**
 * Root error handler for uncaught errors
 */
const handleRootError = (error: Error): void => {
  console.error('Root level error:', error);
  // Log to monitoring service in production
  if (process.env.NODE_ENV === 'production') {
    // Implementation for error logging would go here
  }
};

/**
 * Loading fallback component for suspense boundary
 */
const LoadingFallback = (): JSX.Element => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-lg text-gray-600 animate-pulse">
      Loading application...
    </div>
  </div>
);

// Initialize performance monitoring
initializePerformanceMonitoring();

// Get root element
const rootElement = document.getElementById(ROOT_ELEMENT_ID);

if (!rootElement) {
  throw new Error(`Unable to find element with id "${ROOT_ELEMENT_ID}"`);
}

// Create root with React 18 concurrent features
const root = ReactDOM.createRoot(rootElement);

// Render application with all required providers
root.render(
  <StrictMode>
    <ErrorBoundary
      FallbackComponent={RootErrorFallback}
      onError={handleRootError}
    >
      <Provider store={store}>
        <Suspense fallback={<LoadingFallback />}>
          <App />
        </Suspense>
      </Provider>
    </ErrorBoundary>
  </StrictMode>
);

// Enable hot module replacement in development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    root.render(
      <StrictMode>
        <ErrorBoundary
          FallbackComponent={RootErrorFallback}
          onError={handleRootError}
        >
          <Provider store={store}>
            <Suspense fallback={<LoadingFallback />}>
              <App />
            </Suspense>
          </Provider>
        </ErrorBoundary>
      </StrictMode>
    );
  });
}