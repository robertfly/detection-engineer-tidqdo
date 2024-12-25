/**
 * Enhanced login form component with MFA support and security features
 * Implements Material Design 3.0 guidelines and comprehensive error handling
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';

// Internal imports
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useAuth } from '../../hooks/useAuth';

// Validation schema
const loginSchema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(12, 'Password must be at least 12 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/,
      'Password must include uppercase, lowercase, number and special character'
    )
    .required('Password is required'),
  mfaCode: yup
    .string()
    .matches(/^\d{6}$/, 'MFA code must be 6 digits')
    .when('requireMFA', {
      is: true,
      then: yup.string().required('MFA code is required'),
    }),
  rememberMe: yup.boolean(),
});

// Types
interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  persistSession?: boolean;
  requireMFA?: boolean;
}

interface LoginFormData {
  email: string;
  password: string;
  mfaCode?: string;
  rememberMe: boolean;
}

/**
 * Enhanced login form component with MFA support and security features
 */
const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onError,
  persistSession = false,
  requireMFA = false,
}) => {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [showMFA, setShowMFA] = useState(requireMFA);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  // Hooks
  const { login, validateMFA } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<LoginFormData>({
    defaultValues: {
      email: '',
      password: '',
      mfaCode: '',
      rememberMe: persistSession,
    },
  });

  // Constants
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Handles form submission with rate limiting and security checks
   */
  const onSubmit = useCallback(async (data: LoginFormData) => {
    if (isLocked) {
      return;
    }

    setIsLoading(true);
    clearErrors();

    try {
      if (showMFA && data.mfaCode) {
        // Handle MFA verification
        await validateMFA({
          mfaToken: data.mfaCode,
          mfaCode: data.mfaCode,
        });
        setShowMFA(false);
      } else {
        // Handle initial login
        const response = await login({
          email: data.email,
          password: data.password,
          rememberMe: data.rememberMe,
        });

        if (response.mfaRequired) {
          setShowMFA(true);
          return;
        }
      }

      // Reset attempts on successful login
      setLoginAttempts(0);
      onSuccess?.();
    } catch (error) {
      // Handle login failure
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        setIsLocked(true);
        setLockoutTime(Date.now() + LOCKOUT_DURATION);
      }

      setError('root', {
        type: 'manual',
        message: error.message || 'Login failed. Please try again.',
      });

      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [
    isLocked,
    showMFA,
    loginAttempts,
    login,
    validateMFA,
    onSuccess,
    onError,
    setError,
    clearErrors,
  ]);

  // Handle lockout timer
  useEffect(() => {
    if (isLocked && lockoutTime) {
      const timer = setTimeout(() => {
        setIsLocked(false);
        setLoginAttempts(0);
        setLockoutTime(null);
      }, lockoutTime - Date.now());

      return () => clearTimeout(timer);
    }
  }, [isLocked, lockoutTime]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 w-full max-w-md"
      noValidate
    >
      {!showMFA ? (
        <>
          <Input
            id="email"
            type="email"
            label="Email"
            error={errors.email?.message}
            disabled={isLoading || isLocked}
            required
            {...register('email')}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            error={errors.password?.message}
            disabled={isLoading || isLocked}
            required
            {...register('password')}
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="form-checkbox"
                {...register('rememberMe')}
              />
              <span className="ml-2 text-sm">Remember me</span>
            </label>
          </div>
        </>
      ) : (
        <Input
          id="mfaCode"
          type="text"
          label="MFA Code"
          error={errors.mfaCode?.message}
          disabled={isLoading || isLocked}
          required
          {...register('mfaCode')}
        />
      )}

      {errors.root && (
        <div className="text-error-600 text-sm mt-2" role="alert">
          {errors.root.message}
        </div>
      )}

      {isLocked && lockoutTime && (
        <div className="text-error-600 text-sm mt-2" role="alert">
          Account temporarily locked. Please try again in{' '}
          {Math.ceil((lockoutTime - Date.now()) / 60000)} minutes.
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="large"
        fullWidth
        loading={isLoading}
        disabled={isLoading || isLocked}
      >
        {showMFA ? 'Verify MFA' : 'Sign In'}
      </Button>
    </form>
  );
};

export default LoginForm;