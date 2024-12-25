// React v18.2.0+
import React, { useState, useCallback, useRef } from 'react';
// classnames v2.3.0+
import classNames from 'classnames';
import { useThemeContext } from '../../contexts/ThemeContext';

/**
 * Props interface for the Checkbox component
 */
export interface CheckboxProps {
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  onChange?: (checked: boolean) => void;
  id?: string;
  name?: string;
}

/**
 * A theme-aware, accessible checkbox component implementing Material Design 3.0 specifications.
 * Supports controlled/uncontrolled states, disabled state, error state, and custom labels.
 * WCAG 2.1 AA compliant with proper contrast ratios and keyboard navigation.
 */
export const Checkbox = React.memo(({
  label,
  checked: controlledChecked,
  defaultChecked = false,
  disabled = false,
  error = false,
  className,
  onChange,
  id,
  name,
}: CheckboxProps): JSX.Element => {
  // Get current theme for styling
  const { theme } = useThemeContext();
  
  // Internal state for uncontrolled mode
  const [internalChecked, setInternalChecked] = useState<boolean>(defaultChecked);
  
  // Determine if component is controlled
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : internalChecked;
  
  // Ref for the input element
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle checkbox state changes
   */
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = event.target.checked;
    
    if (!isControlled) {
      setInternalChecked(newChecked);
    }
    
    onChange?.(newChecked);
  }, [isControlled, onChange]);

  /**
   * Handle keyboard interaction for accessibility
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLLabelElement>) => {
    if (event.key === ' ' && !disabled) {
      event.preventDefault();
      inputRef.current?.click();
    }
  }, [disabled]);

  // Generate unique ID for input-label association
  const uniqueId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  // Style classes based on state
  const containerClasses = classNames(
    'checkbox-container',
    {
      'checkbox-disabled': disabled,
      'checkbox-error': error,
    },
    className
  );

  const checkboxClasses = classNames(
    'checkbox-input',
    {
      'checkbox-checked': isChecked,
      'checkbox-error': error,
    }
  );

  return (
    <label
      className={containerClasses}
      htmlFor={uniqueId}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="checkbox"
      aria-checked={isChecked}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="checkbox"
        id={uniqueId}
        name={name}
        className={checkboxClasses}
        checked={isChecked}
        onChange={handleChange}
        disabled={disabled}
        aria-invalid={error}
      />
      <span className="checkbox-label">{label}</span>
      <style jsx>{`
        .checkbox-container {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          cursor: ${disabled ? 'not-allowed' : 'pointer'};
          user-select: none;
          position: relative;
        }

        .checkbox-input {
          appearance: none;
          width: 18px;
          height: 18px;
          border: 2px solid ${error 
            ? theme.palette.error.main 
            : isChecked 
              ? theme.palette.primary.main 
              : theme.palette.mode === 'dark' 
                ? theme.palette.grey[400] 
                : theme.palette.grey[600]};
          border-radius: 2px;
          transition: all 0.2s ease-in-out;
          background: ${isChecked 
            ? theme.palette.primary.main 
            : theme.palette.background.paper};
          position: relative;
        }

        .checkbox-input:checked::after {
          content: '';
          position: absolute;
          left: 5px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid ${theme.palette.primary.contrastText};
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .checkbox-input:focus-visible {
          outline: 2px solid ${theme.palette.primary.main};
          outline-offset: 2px;
        }

        .checkbox-label {
          font-family: ${theme.typography.fontFamily};
          font-size: ${theme.typography.body1.fontSize};
          line-height: ${theme.typography.body1.lineHeight};
          color: ${disabled 
            ? theme.palette.text.disabled 
            : theme.palette.text.primary};
        }

        .checkbox-disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }

        .checkbox-error .checkbox-label {
          color: ${theme.palette.error.main};
        }

        @media (hover: hover) {
          .checkbox-input:not(:disabled):hover {
            border-color: ${theme.palette.primary.main};
            background: ${theme.palette.action.hover};
          }
        }
      `}</style>
    </label>
  );
});

Checkbox.displayName = 'Checkbox';