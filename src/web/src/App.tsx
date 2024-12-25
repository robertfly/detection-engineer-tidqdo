// React v18.2.0
import React, { Suspense, lazy, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import WorkbenchLayout from './layouts/WorkbenchLayout';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { useAuth } from './hooks/useAuth';

// Lazy-loaded components
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Workbench = lazy(() => import('./pages/Workbench'));

/**
 * Protected route wrapper component with role-based access control
 */
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  requiredRoles?: string[];
}> = ({ children, requiredRoles = [] }) => {
  const { isAuthenticated, hasRole } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.some(role => hasRole(role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

/**
 * Custom error handler for error boundary
 */
const handleError = (error: Error, info: { componentStack: string }) => {
  // Log error to monitoring service
  console.error('Application Error:', error);
  console.error('Component Stack:', info.componentStack);
};

/**
 * Loading fallback component
 */
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-lg text-gray-600">Loading...</div>
  </div>
);

/**
 * Root application component providing global context providers,
 * routing configuration, and layout structure
 */
const App: React.FC = () => {
  // Error boundary fallback UI
  const ErrorFallback = useCallback(({ error }: { error: Error }) => (
    <div role="alert" className="p-4">
      <h2 className="text-lg font-semibold text-red-600">Something went wrong</h2>
      <pre className="mt-2 text-sm text-red-500">{error.message}</pre>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        Refresh Page
      </button>
    </div>
  ), []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={handleError}
    >
      <ThemeProvider>
        <AuthProvider>
          <WebSocketProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  {/* Auth Routes */}
                  <Route path="/auth" element={<AuthLayout />}>
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                  </Route>

                  {/* Protected Dashboard Routes */}
                  <Route
                    path="/dashboard/*"
                    element={
                      <ProtectedRoute>
                        <DashboardLayout>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="settings" element={<Settings />} />
                          </Routes>
                        </DashboardLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Protected Workbench Routes */}
                  <Route
                    path="/workbench/*"
                    element={
                      <ProtectedRoute requiredRoles={['user', 'admin']}>
                        <WorkbenchLayout>
                          <Routes>
                            <Route path="/" element={<Workbench />} />
                          </Routes>
                        </WorkbenchLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Default Redirect */}
                  <Route
                    path="/"
                    element={<Navigate to="/dashboard" replace />}
                  />

                  {/* 404 Fallback */}
                  <Route
                    path="*"
                    element={
                      <div className="flex items-center justify-center min-h-screen">
                        <div className="text-lg text-gray-600">
                          Page not found
                        </div>
                      </div>
                    }
                  />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </WebSocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;