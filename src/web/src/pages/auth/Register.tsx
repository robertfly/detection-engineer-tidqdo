/**
 * Enhanced registration page component implementing secure user registration
 * with comprehensive validation, error handling, and accessibility features.
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useState } from 'react'; // v18.2.0
import { useNavigate } from 'react-router-dom'; // v6.0.0
import { RegisterForm } from '../../components/auth/RegisterForm';
import { AuthLayout } from '../../layouts/AuthLayout';
import { useAuth } from '../../hooks/useAuth';

// Constants
const REDIRECT_DELAY = 1500; // Delay before redirect after successful registration
const MAX_REGISTRATION_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Enhanced registration page component with security features and accessibility
 */
const Register: React.FC = React.memo(() => {
  // Hooks
  const navigate = useNavigate();
  const { isAuthenticated, register, loading } = useAuth();
  const [registrationAttempts, setRegistrationAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  /**
   * Redirect to dashboard if already authenticated
   */
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  /**
   * Reset registration attempts after lockout period
   */
  useEffect(() => {
    if (lockoutUntil && Date.now() > lockoutUntil) {
      setRegistrationAttempts(0);
      setLockoutUntil(null);
    }
  }, [lockoutUntil]);

  /**
   * Cleanup effect on component unmount
   */
  useEffect(() => {
    return () => {
      // Clear any timeouts or state
      setRegistrationAttempts(0);
      setLockoutUntil(null);
    };
  }, []);

  /**
   * Handles successful registration with proper feedback and redirection
   */
  const handleRegistrationSuccess = useCallback(() => {
    // Reset attempts on success
    setRegistrationAttempts(0);
    setLockoutUntil(null);

    // Show success message (implementation depends on your notification system)
    console.info('Registration successful');

    // Delay redirect for user feedback
    setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, REDIRECT_DELAY);
  }, [navigate]);

  /**
   * Enhanced error handling for registration failures
   */
  const handleRegistrationError = useCallback((error: Error) => {
    // Increment attempts
    setRegistrationAttempts(prev => {
      const newAttempts = prev + 1;
      
      // Implement lockout if max attempts exceeded
      if (newAttempts >= MAX_REGISTRATION_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION;
        setLockoutUntil(lockoutTime);
        
        // Log security event
        console.error('Registration attempts exceeded', {
          attempts: newAttempts,
          lockoutUntil: new Date(lockoutTime).toISOString()
        });
      }
      
      return newAttempts;
    });

    // Log error for monitoring
    console.error('Registration error:', {
      error,
      attempts: registrationAttempts + 1
    });
  }, [registrationAttempts]);

  /**
   * Handles registration form submission with security checks
   */
  const handleRegister = useCallback(async (formData: any) => {
    // Check for lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingTime = Math.ceil((lockoutUntil - Date.now()) / 1000 / 60);
      throw new Error(`Too many attempts. Please try again in ${remainingTime} minutes.`);
    }

    try {
      await register(formData);
      handleRegistrationSuccess();
    } catch (error) {
      handleRegistrationError(error as Error);
      throw error; // Re-throw for form error handling
    }
  }, [register, handleRegistrationSuccess, handleRegistrationError, lockoutUntil]);

  return (
    <AuthLayout
      title="Create your account"
      testId="register-page"
    >
      <RegisterForm
        onSuccess={handleRegistrationSuccess}
        onError={handleRegistrationError}
        onSubmit={handleRegister}
        isLoading={loading}
        isLocked={!!lockoutUntil && Date.now() < lockoutUntil}
        attemptsRemaining={MAX_REGISTRATION_ATTEMPTS - registrationAttempts}
        enableMFA={true}
        allowOAuth={true}
      />
    </AuthLayout>
  );
});

// Display name for debugging
Register.displayName = 'Register';

export default Register;