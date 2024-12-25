/**
 * Enhanced registration form component implementing Material Design 3.0 specifications
 * with comprehensive validation, security features, and accessibility support.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form'; // v7.0.0
import * as yup from 'yup'; // v1.3.0
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useAuth } from '../../hooks/useAuth';

// Constants
const PASSWORD_MIN_LENGTH = 12;
const EMAIL_CHECK_DEBOUNCE = 500;
const MAX_ATTEMPTS = 5;

// Validation schema with enhanced security requirements
const validationSchema = yup.object().shape({
  email: yup
    .string()
    .required('Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: yup
    .string()
    .required('Password is required')
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
      'Password must include uppercase, lowercase, number and special character'
    ),
  confirmPassword: yup
    .string()
    .required('Please confirm your password')
    .oneOf([yup.ref('password')], 'Passwords must match'),
  name: yup
    .string()
    .required('Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be less than 50 characters'),
  organization: yup
    .string()
    .required('Organization is required')
    .min(2, 'Organization must be at least 2 characters')
    .max(100, 'Organization must be less than 100 characters'),
  acceptTerms: yup
    .boolean()
    .oneOf([true], 'You must accept the terms and conditions')
});

// Props interface
interface RegisterFormProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  enableMFA?: boolean;
  allowOAuth?: boolean;
}

// Form data interface
interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  organization: string;
  acceptTerms: boolean;
}

/**
 * Enhanced registration form component with security features and accessibility
 */
const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onError,
  enableMFA = true,
  allowOAuth = true
}) => {
  // State management
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isEmailAvailable, setIsEmailAvailable] = useState<boolean | null>(null);
  const [emailCheckTimeout, setEmailCheckTimeout] = useState<NodeJS.Timeout>();

  // Hooks
  const { register: registerUser, checkEmailAvailability } = useAuth();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
    setError,
    clearErrors
  } = useForm<RegisterFormData>({
    mode: 'onChange',
    validationSchema
  });

  // Watch email field for availability check
  const emailValue = watch('email');

  /**
   * Handles email availability check with debouncing
   */
  useEffect(() => {
    if (emailValue) {
      // Clear existing timeout
      if (emailCheckTimeout) {
        clearTimeout(emailCheckTimeout);
      }

      // Set new timeout for email check
      const timeout = setTimeout(async () => {
        try {
          const isAvailable = await checkEmailAvailability(emailValue);
          setIsEmailAvailable(isAvailable);
          
          if (!isAvailable) {
            setError('email', {
              type: 'manual',
              message: 'This email is already registered'
            });
          } else {
            clearErrors('email');
          }
        } catch (error) {
          console.error('Email check failed:', error);
        }
      }, EMAIL_CHECK_DEBOUNCE);

      setEmailCheckTimeout(timeout);
    }

    return () => {
      if (emailCheckTimeout) {
        clearTimeout(emailCheckTimeout);
      }
    };
  }, [emailValue, checkEmailAvailability, setError, clearErrors]);

  /**
   * Handles form submission with rate limiting and security checks
   */
  const onSubmit = useCallback(async (data: RegisterFormData) => {
    try {
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error('Maximum registration attempts exceeded. Please try again later.');
      }

      setIsSubmitting(true);
      setAttempts(prev => prev + 1);

      // Remove confirm password before sending to API
      const { confirmPassword, ...registrationData } = data;

      await registerUser({
        ...registrationData,
        enableMFA
      });

      onSuccess?.();
    } catch (error) {
      console.error('Registration error:', error);
      onError?.(error as Error);
      
      setError('root', {
        type: 'manual',
        message: 'Registration failed. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [attempts, registerUser, enableMFA, onSuccess, onError, setError]);

  return (
    <form 
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
      aria-label="Registration form"
    >
      <Input
        id="name"
        label="Full Name"
        type="text"
        error={errors.name?.message}
        required
        autoComplete="name"
        {...register('name')}
      />

      <Input
        id="email"
        label="Email Address"
        type="email"
        error={errors.email?.message}
        required
        autoComplete="email"
        {...register('email')}
      />

      <Input
        id="organization"
        label="Organization"
        type="text"
        error={errors.organization?.message}
        required
        autoComplete="organization"
        {...register('organization')}
      />

      <Input
        id="password"
        label="Password"
        type="password"
        error={errors.password?.message}
        required
        autoComplete="new-password"
        {...register('password')}
      />

      <Input
        id="confirmPassword"
        label="Confirm Password"
        type="password"
        error={errors.confirmPassword?.message}
        required
        autoComplete="new-password"
        {...register('confirmPassword')}
      />

      <div className="flex items-center">
        <input
          id="acceptTerms"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          {...register('acceptTerms')}
        />
        <label 
          htmlFor="acceptTerms"
          className="ml-2 block text-sm text-gray-900"
        >
          I accept the terms and conditions
        </label>
      </div>
      {errors.acceptTerms && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {errors.acceptTerms.message}
        </p>
      )}

      {errors.root && (
        <div 
          className="p-3 rounded bg-red-50 text-red-700"
          role="alert"
        >
          {errors.root.message}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="large"
        fullWidth
        disabled={!isValid || isSubmitting || attempts >= MAX_ATTEMPTS}
        loading={isSubmitting}
      >
        {isSubmitting ? 'Creating Account...' : 'Create Account'}
      </Button>

      {allowOAuth && (
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">
                Or continue with
              </span>
            </div>
          </div>

          {/* OAuth buttons would go here */}
        </div>
      )}
    </form>
  );
};

export default RegisterForm;