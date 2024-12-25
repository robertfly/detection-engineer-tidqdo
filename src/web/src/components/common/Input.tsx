/**
 * Material Design 3.0 compliant form input component with enhanced validation
 * Version: 1.0.0
 * Dependencies:
 * - react@18.2.0+
 * - classnames@2.3.0+
 */

import React, { useCallback, useState, useRef, forwardRef } from 'react';
import classNames from 'classnames'; // v2.3.0+
import { useTheme } from '../../hooks/useTheme';
import { validateDetection, ValidationResult } from '../../utils/validation';
import '../../styles/components.css';

// Validation options interface
interface ValidationOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
}

// Input component props interface
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  name: string;
  type?: string;
  value: string;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  validate?: (value: string) => Promise<ValidationResult> | ValidationResult;
  validationOptions?: ValidationOptions;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>, validationResult?: ValidationResult) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>, validationResult?: ValidationResult) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Material Design 3.0 compliant input component with enhanced validation and accessibility
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  id,
  name,
  type = 'text',
  value,
  placeholder,
  label,
  error,
  disabled = false,
  required = false,
  autoFocus = false,
  className,
  ariaLabel,
  ariaDescribedBy,
  validate,
  validationOptions = {
    validateOnChange: true,
    validateOnBlur: true,
    debounceMs: 300
  },
  onChange,
  onBlur,
  onFocus,
  ...props
}, ref) => {
  // Theme context for dynamic styling
  const { theme, isDarkMode } = useTheme();

  // Internal state management
  const [isTouched, setIsTouched] = useState(false);
  const [internalError, setInternalError] = useState<string | undefined>(error);
  const debounceTimeout = useRef<NodeJS.Timeout>();

  /**
   * Handles input validation with debouncing
   */
  const handleValidation = useCallback(async (value: string) => {
    if (!validate) return;

    try {
      const result = await validate(value);
      setInternalError(result.isValid ? undefined : result.errors[0]);
      return result;
    } catch (err) {
      setInternalError('Validation error occurred');
      return {
        isValid: false,
        errors: ['Validation error occurred'],
        metrics: { validation_time_ms: 0 }
      };
    }
  }, [validate]);

  /**
   * Enhanced change handler with validation support
   */
  const handleChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    // Clear existing timeout if any
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Handle validation if enabled
    if (validate && validationOptions.validateOnChange) {
      debounceTimeout.current = setTimeout(async () => {
        const result = await handleValidation(newValue);
        onChange?.(event, result);
      }, validationOptions.debounceMs);
    } else {
      onChange?.(event);
    }
  }, [onChange, validate, validationOptions, handleValidation]);

  /**
   * Enhanced blur handler with validation support
   */
  const handleBlur = useCallback(async (event: React.FocusEvent<HTMLInputElement>) => {
    setIsTouched(true);

    if (validate && validationOptions.validateOnBlur) {
      const result = await handleValidation(event.target.value);
      onBlur?.(event, result);
    } else {
      onBlur?.(event);
    }
  }, [onBlur, validate, validationOptions, handleValidation]);

  /**
   * Focus handler with accessibility announcements
   */
  const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    if (onFocus) {
      onFocus(event);
    }

    // Announce field purpose for screen readers
    const announcement = `${label || name} field, ${required ? 'required' : 'optional'}`;
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(announcement);
      window.speechSynthesis.speak(utterance);
    }
  }, [onFocus, label, name, required]);

  // Compute input classes
  const inputClasses = classNames(
    'input',
    {
      'input-error': (isTouched && internalError) || error,
      'input-disabled': disabled,
      'gpu-accelerated': true
    },
    className
  );

  // Compute label classes
  const labelClasses = classNames(
    'inputLabel',
    {
      'label-error': (isTouched && internalError) || error,
      'label-disabled': disabled
    }
  );

  return (
    <div className="input-container">
      {label && (
        <label 
          htmlFor={id}
          className={labelClasses}
        >
          {label}
          {required && <span className="required-indicator">*</span>}
        </label>
      )}
      
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className={inputClasses}
        aria-label={ariaLabel || label}
        aria-describedby={ariaDescribedBy}
        aria-invalid={!!(isTouched && (internalError || error))}
        aria-required={required}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        {...props}
      />

      {(isTouched && (internalError || error)) && (
        <div 
          className="error-message"
          role="alert"
          aria-live="polite"
        >
          {internalError || error}
        </div>
      )}
    </div>
  );
});

// Display name for debugging
Input.displayName = 'Input';

export default Input;