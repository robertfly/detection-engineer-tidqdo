/**
 * Enhanced login page component providing secure user authentication with email/password
 * and MFA support, comprehensive error handling, accessibility features, and performance monitoring.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom'; // v6.16.0

// Internal imports
import AuthLayout from '../../layouts/AuthLayout';
import LoginForm from '../../components/auth/LoginForm';
import { useAuth } from '../../hooks/useAuth';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { ERROR_CODES } from '../../config/constants';

// Types
interface LoginError {
  code: string;
  message: string;
}

/**
 * Enhanced login page component with security, accessibility, and performance features
 */
const LoginPage: React.FC = () => {
  // Hooks
  const navigate = useNavigate();
  const { login, isAuthenticated, requiresMFA } = useAuth();

  // State management
  const [error, setError] = useState<LoginError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  // Constants
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Handles successful login with security logging and navigation
   */
  const handleLoginSuccess = useCallback(async () => {
    // Log successful login attempt
    console.info('Login successful', {
      timestamp: new Date().toISOString(),
      requiresMFA
    });

    // Reset login attempts on success
    setLoginAttempts(0);
    setIsLocked(false);
    setLockoutTime(null);

    // Handle navigation based on MFA requirement
    if (requiresMFA) {
      navigate('/auth/mfa');
    } else {
      navigate('/dashboard');
    }

    // Announce success to screen readers
    const message = requiresMFA 
      ? 'Login successful. MFA verification required.' 
      : 'Login successful. Redirecting to dashboard.';
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      window.speechSynthesis.speak(utterance);
    }
  }, [navigate, requiresMFA]);

  /**
   * Enhanced error handler with security logging and user feedback
   */
  const handleLoginError = useCallback((error: Error) => {
    // Log error securely
    console.error('Login error:', {
      code: error.name,
      message: error.message,
      timestamp: new Date().toISOString()
    });

    // Update login attempts
    const newAttempts = loginAttempts + 1;
    setLoginAttempts(newAttempts);

    // Handle account lockout
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      setIsLocked(true);
      setLockoutTime(Date.now() + LOCKOUT_DURATION);
      setError({
        code: ERROR_CODES.AUTH.UNAUTHORIZED.toString(),
        message: 'Account temporarily locked. Please try again later.'
      });
    } else {
      setError({
        code: ERROR_CODES.AUTH.INVALID_CREDENTIALS.toString(),
        message: 'Invalid email or password. Please try again.'
      });
    }

    setIsLoading(false);

    // Announce error to screen readers
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        `Login failed. ${error.message}`
      );
      window.speechSynthesis.speak(utterance);
    }
  }, [loginAttempts]);

  // Handle lockout timer
  useEffect(() => {
    if (isLocked && lockoutTime) {
      const timer = setTimeout(() => {
        setIsLocked(false);
        setLoginAttempts(0);
        setLockoutTime(null);
        setError(null);
      }, lockoutTime - Date.now());

      return () => clearTimeout(timer);
    }
  }, [isLocked, lockoutTime]);

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <ErrorBoundary
      onError={(error) => {
        console.error('Login page error:', error);
        setError({
          code: ERROR_CODES.API.SERVICE_UNAVAILABLE.toString(),
          message: 'An unexpected error occurred. Please try again.'
        });
      }}
    >
      <AuthLayout
        title="Sign In"
        testId="login-page"
        className="min-h-screen bg-gray-50 dark:bg-gray-900"
      >
        <div className="w-full max-w-md mx-auto">
          <LoginForm
            onSuccess={handleLoginSuccess}
            onError={handleLoginError}
            persistSession={false}
            requireMFA={requiresMFA}
          />

          {error && (
            <div
              className="mt-4 p-4 rounded-md bg-error-50 dark:bg-error-900 text-error-700 dark:text-error-200"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm font-medium">{error.message}</p>
              {isLocked && lockoutTime && (
                <p className="text-sm mt-2">
                  Please try again in {Math.ceil((lockoutTime - Date.now()) / 60000)} minutes.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 text-center">
            <a
              href="/auth/forgot-password"
              className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Forgot your password?
            </a>
          </div>
        </div>
      </AuthLayout>
    </ErrorBoundary>
  );
};

export default LoginPage;