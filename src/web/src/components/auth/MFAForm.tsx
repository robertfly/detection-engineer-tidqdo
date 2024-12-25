/**
 * MFA Form Component implementing TOTP-based verification (RFC 6238)
 * with comprehensive security measures and accessibility features.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { debounce } from 'lodash'; // v4.17+
import Button from '../common/Button';
import Input from '../common/Input';
import { useAuth } from '../../hooks/useAuth';

// Constants
const MFA_CODE_LENGTH = 6;
const INITIAL_LOCKOUT_TIME = 30000; // 30 seconds
const MAX_ATTEMPTS = 3;
const DEBOUNCE_DELAY = 300;

// Types
interface MFAFormProps {
  /** Session identifier for MFA verification */
  sessionId: string;
  /** Callback for successful verification */
  onSuccess: () => void;
  /** Callback for verification failure */
  onError: (error: MFAValidationError) => void;
  /** Enable biometric authentication if available */
  enableBiometric?: boolean;
  /** Maximum number of verification attempts */
  maxAttempts?: number;
}

interface MFAValidationError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Enhanced MFA form component with security features and accessibility
 */
const MFAForm: React.FC<MFAFormProps> = ({
  sessionId,
  onSuccess,
  onError,
  enableBiometric = false,
  maxAttempts = MAX_ATTEMPTS,
}) => {
  // State management
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<MFAValidationError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockoutTime, setLockoutTime] = useState<number>(INITIAL_LOCKOUT_TIME);

  // Custom hooks
  const { validateMFA } = useAuth();

  /**
   * Progressive delay calculation for rate limiting
   */
  const calculateLockoutTime = useCallback((attemptCount: number): number => {
    return Math.min(INITIAL_LOCKOUT_TIME * Math.pow(2, attemptCount), 3600000); // Max 1 hour
  }, []);

  /**
   * Handles lockout state and countdown
   */
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isLocked && lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => {
          const newTime = prev - 1000;
          if (newTime <= 0) {
            setIsLocked(false);
            return INITIAL_LOCKOUT_TIME;
          }
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isLocked, lockoutTime]);

  /**
   * Validates MFA code format
   */
  const validateCodeFormat = useCallback((value: string): boolean => {
    return /^\d{6}$/.test(value);
  }, []);

  /**
   * Debounced code input handler with validation
   */
  const handleCodeChange = debounce((value: string) => {
    // Clear previous errors
    setError(null);

    // Sanitize input
    const sanitizedValue = value.replace(/[^0-9]/g, '').slice(0, MFA_CODE_LENGTH);
    setCode(sanitizedValue);

    // Client-side validation
    if (sanitizedValue.length === MFA_CODE_LENGTH && !validateCodeFormat(sanitizedValue)) {
      setError({
        code: 'INVALID_FORMAT',
        message: 'Please enter a valid 6-digit code',
      });
    }
  }, DEBOUNCE_DELAY);

  /**
   * Handles form submission with security measures
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    // Validate session
    if (!sessionId) {
      setError({
        code: 'INVALID_SESSION',
        message: 'Invalid session. Please try again.',
      });
      return;
    }

    // Check rate limiting
    if (isLocked) {
      return;
    }

    // Validate code format
    if (!validateCodeFormat(code)) {
      setError({
        code: 'INVALID_FORMAT',
        message: 'Please enter a valid 6-digit code',
      });
      return;
    }

    setLoading(true);
    try {
      await validateMFA({
        mfaToken: sessionId,
        mfaCode: code,
      });

      // Reset state on success
      setAttempts(0);
      setError(null);
      onSuccess();
    } catch (error) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      // Handle rate limiting
      if (newAttempts >= maxAttempts) {
        setIsLocked(true);
        setLockoutTime(calculateLockoutTime(Math.floor(newAttempts / maxAttempts)));
      }

      const mfaError: MFAValidationError = {
        code: 'VALIDATION_FAILED',
        message: 'Invalid verification code. Please try again.',
        details: error,
      };

      setError(mfaError);
      onError(mfaError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mfa-form"
      aria-labelledby="mfa-title"
      noValidate
    >
      <h2 id="mfa-title" className="text-xl font-semibold mb-4">
        Two-Factor Authentication
      </h2>

      <div className="space-y-4">
        <Input
          id="mfa-code"
          name="mfa-code"
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={MFA_CODE_LENGTH}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder="Enter 6-digit code"
          label="Verification Code"
          error={error?.message}
          disabled={isLocked || loading}
          required
          autoComplete="one-time-code"
          aria-describedby={error ? 'mfa-error' : undefined}
        />

        {error && (
          <div
            id="mfa-error"
            role="alert"
            className="text-error-600 text-sm"
            aria-live="polite"
          >
            {error.message}
          </div>
        )}

        {isLocked && (
          <div
            role="alert"
            className="text-warning-600 text-sm"
            aria-live="polite"
          >
            Too many attempts. Please wait {Math.ceil(lockoutTime / 1000)} seconds.
          </div>
        )}

        <Button
          type="submit"
          disabled={isLocked || loading || code.length !== MFA_CODE_LENGTH}
          loading={loading}
          fullWidth
          ariaLabel="Verify MFA code"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </Button>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        <p>
          Enter the 6-digit code from your authenticator app.
          {attempts > 0 && ` ${maxAttempts - attempts} attempts remaining.`}
        </p>
      </div>
    </form>
  );
};

export default MFAForm;