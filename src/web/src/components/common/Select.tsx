// Select.tsx
// Version: 1.0.0
// A reusable select component implementing Material Design 3.0 specifications
// with comprehensive accessibility features and mobile optimization.

import React, { useCallback, useState, useRef } from 'react';
import classnames from 'classnames'; // v2.3.0
import Dropdown, { DropdownProps } from './Dropdown';
import { useTheme } from '../../hooks/useTheme';

// Constants for ARIA labels and IDs
const ARIA = {
  SELECT: 'select',
  LABEL: 'select-label',
  ERROR: 'select-error',
  DESCRIPTION: 'select-description',
} as const;

// Interface for select options
export interface SelectOption {
  label: string;
  value: any;
  disabled?: boolean;
  'aria-label'?: string;
  description?: string;
}

// Props interface for the Select component
export interface SelectProps {
  /** Unique identifier for the select */
  id: string;
  /** Name attribute for form submission */
  name: string;
  /** Label text */
  label: string;
  /** Array of options */
  options: SelectOption[];
  /** Currently selected value(s) */
  value: any;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Multiple selection mode */
  isMulti?: boolean;
  /** Searchable mode */
  isSearchable?: boolean;
  /** Required field */
  required?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Error message */
  error?: string;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  'aria-label'?: string;
  /** ID of element describing the select */
  'aria-describedby'?: string;
  /** ARIA role override */
  role?: string;
  /** Change handler */
  onChange: (value: any) => void;
  /** Focus handler */
  onFocus?: () => void;
  /** Blur handler */
  onBlur?: () => void;
}

/**
 * Enhanced select component with comprehensive accessibility features
 * and Material Design 3.0 specifications.
 */
const Select: React.FC<SelectProps> = ({
  id,
  name,
  label,
  options,
  value,
  placeholder = 'Select an option',
  disabled = false,
  isMulti = false,
  isSearchable = false,
  required = false,
  isLoading = false,
  error,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  role,
  onChange,
  onFocus,
  onBlur,
}) => {
  // Theme context for styling
  const { theme, isDarkMode } = useTheme();

  // Refs for accessibility
  const labelRef = useRef<HTMLLabelElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);

  // State for internal management
  const [isFocused, setIsFocused] = useState(false);

  // Handle focus events
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  // Handle blur events
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  // Generate container classes
  const containerClasses = classnames(
    'relative w-full',
    {
      'opacity-50 cursor-not-allowed': disabled,
    },
    className
  );

  // Generate label classes
  const labelClasses = classnames(
    'block mb-2 text-sm font-medium',
    {
      'text-gray-900 dark:text-gray-100': !error,
      'text-error-500': error,
      'cursor-not-allowed': disabled,
    }
  );

  // Format options for dropdown
  const formattedOptions = options.map(option => ({
    ...option,
    'aria-selected': Array.isArray(value) 
      ? value.includes(option.value)
      : value === option.value,
  }));

  // Generate unique IDs for accessibility
  const labelId = `${id}-${ARIA.LABEL}`;
  const errorId = `${id}-${ARIA.ERROR}`;
  const descriptionId = ariaDescribedBy || `${id}-${ARIA.DESCRIPTION}`;

  return (
    <div className={containerClasses}>
      <label
        ref={labelRef}
        htmlFor={id}
        id={labelId}
        className={labelClasses}
      >
        {label}
        {required && (
          <span className="ml-1 text-error-500" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div
        ref={selectRef}
        className="relative"
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        <Dropdown
          label={label}
          options={formattedOptions}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          isMulti={isMulti}
          isSearchable={isSearchable}
          isLoading={isLoading}
          hasError={!!error}
          errorMessage={error}
          className="w-full"
          onChange={onChange}
          aria={{
            label: ariaLabel || label,
            description: descriptionId,
          }}
        />
      </div>

      {error && (
        <p
          id={errorId}
          className="mt-2 text-sm text-error-500"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      {/* Hidden description for screen readers */}
      <span id={descriptionId} className="sr-only">
        {`${label} ${required ? 'required' : 'optional'} field`}
      </span>
    </div>
  );
};

export default Select;
export type { SelectProps, SelectOption };