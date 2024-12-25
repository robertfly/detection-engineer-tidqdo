// External imports with versions
import React from 'react'; // v18.2.0
import ReactDOM from 'react-dom/client'; // v18.2.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { ThemeProvider, createTheme, useMediaQuery, CssBaseline } from '@mui/material'; // v5.0.0
import { Auth0Provider } from '@auth0/auth0-react'; // v2.0.0

// Internal imports
import { Popup, checkAuth, handleLogin, useSecurityContext } from './components/Popup';

// Import styles
import './styles.css';

// Constants
const AUTH0_CONFIG = {
  domain: process.env.REACT_APP_AUTH0_DOMAIN || '',
  clientId: process.env.REACT_APP_AUTH0_CLIENT_ID || '',
  audience: process.env.REACT_APP_AUTH0_AUDIENCE || '',
  redirectUri: chrome.runtime.getURL('popup.html')
};

/**
 * Error Fallback component for graceful error handling
 */
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div role="alert" className="error-container">
    <h2>Something went wrong</h2>
    <pre>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

/**
 * Theme configuration with accessibility support
 */
const createAppTheme = (prefersDarkMode: boolean) => 
  createTheme({
    palette: {
      mode: prefersDarkMode ? 'dark' : 'light',
      primary: {
        main: '#1976D2'
      },
      secondary: {
        main: '#424242'
      },
      error: {
        main: '#D32F2F'
      }
    },
    typography: {
      fontFamily: 'Inter, -apple-system, system-ui, sans-serif'
    },
    components: {
      MuiButton: {
        defaultProps: {
          disableElevation: true
        },
        styleOverrides: {
          root: {
            textTransform: 'none'
          }
        }
      }
    }
  });

/**
 * Root App component with providers and initialization
 */
const App: React.FC = () => {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = React.useMemo(
    () => createAppTheme(prefersDarkMode),
    [prefersDarkMode]
  );

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset app state on error recovery
        window.location.reload();
      }}
    >
      <Auth0Provider {...AUTH0_CONFIG}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Popup />
        </ThemeProvider>
      </Auth0Provider>
    </ErrorBoundary>
  );
};

/**
 * Initialize security features and CSP
 */
const setupSecurity = (): void => {
  // Set up Content Security Policy
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${process.env.REACT_APP_API_BASE_URL} https://*.auth0.com`,
    "img-src 'self' data: https:",
    "frame-src 'none'",
    "object-src 'none'"
  ].join('; ');
  document.head.appendChild(meta);

  // Enable other security headers
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };

  Object.entries(securityHeaders).forEach(([header, value]) => {
    const meta = document.createElement('meta');
    meta.httpEquiv = header;
    meta.content = value;
    document.head.appendChild(meta);
  });
};

/**
 * Initialize performance monitoring
 */
const setupPerformanceMonitoring = (): void => {
  // Create performance observer
  const performanceObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      // Log performance metrics
      console.debug('Performance Entry:', {
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime,
        entryType: entry.entryType
      });
    });
  });

  // Observe various performance metrics
  performanceObserver.observe({
    entryTypes: ['navigation', 'resource', 'paint', 'largest-contentful-paint']
  });
};

/**
 * Initialize the application with security context and error handling
 */
const initializeApp = (): void => {
  try {
    // Setup security features
    setupSecurity();

    // Setup performance monitoring
    setupPerformanceMonitoring();

    // Create root container with security attributes
    const container = document.getElementById('popup-root');
    if (!container) {
      throw new Error('Root container not found');
    }

    // Set security attributes
    container.setAttribute('data-secure-context', 'true');
    container.setAttribute('data-csp-enabled', 'true');

    // Create and render React root
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

  } catch (error) {
    console.error('Initialization failed:', error);
    // Display error message in container
    const container = document.getElementById('popup-root');
    if (container) {
      container.innerHTML = `
        <div role="alert" class="error-container">
          <h2>Initialization Error</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
      `;
    }
  }
};

// Initialize the application
initializeApp();

// Export for external use
export default initializeApp;