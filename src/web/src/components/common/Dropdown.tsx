// Dropdown.tsx
// Version: 1.0.0
// An enterprise-grade, accessible dropdown component implementing Material Design 3.0
// specifications with comprehensive features and WCAG 2.1 AA compliance.

import React, { 
  useCallback, 
  useEffect, 
  useRef, 
  useState, 
  memo 
} from 'react';
import classnames from 'classnames'; // v2.3.0
import { useVirtual } from 'react-virtual'; // v2.10.4
import { debounce } from 'lodash'; // v4.17.21
import { Button } from './Button';
import { useTheme } from '../../hooks/useTheme';

// Constants for keyboard navigation
const KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  HOME: 'Home',
  END: 'End',
  TAB: 'Tab',
} as const;

// Default virtualization configuration
const DEFAULT_VIRTUAL_CONFIG = {
  itemSize: 40,
  overscan: 5,
  minHeight: 200,
  maxHeight: 300,
};

// ARIA IDs and labels
const ARIA = {
  LISTBOX: 'dropdown-listbox',
  OPTION: 'dropdown-option',
  TRIGGER: 'dropdown-trigger',
};

// Interface definitions
export interface DropdownProps<T = any> {
  /** Label for the dropdown */
  label: string;
  /** Array of options to display */
  options: T[];
  /** Currently selected value(s) */
  value?: T | T[];
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Allow multiple selections */
  isMulti?: boolean;
  /** Enable search functionality */
  isSearchable?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Additional CSS classes */
  className?: string;
  /** Change handler */
  onChange?: (value: T | T[]) => void;
  /** Search input change handler */
  onSearch?: (query: string) => void;
  /** Blur event handler */
  onBlur?: () => void;
  /** Focus event handler */
  onFocus?: () => void;
  /** Custom option renderer */
  renderOption?: (option: T) => React.ReactNode;
  /** Custom group header renderer */
  renderGroupHeader?: (label: string) => React.ReactNode;
  /** Virtualization configuration */
  virtualizationConfig?: typeof DEFAULT_VIRTUAL_CONFIG;
  /** ARIA attributes override */
  aria?: {
    label?: string;
    description?: string;
  };
}

/**
 * Enterprise-grade dropdown component with comprehensive accessibility features
 * and Material Design 3.0 compliance.
 */
const Dropdown = memo(<T extends any>({
  label,
  options,
  value,
  placeholder = 'Select an option',
  disabled = false,
  isMulti = false,
  isSearchable = false,
  isLoading = false,
  hasError = false,
  errorMessage,
  className,
  onChange,
  onSearch,
  onBlur,
  onFocus,
  renderOption,
  renderGroupHeader,
  virtualizationConfig = DEFAULT_VIRTUAL_CONFIG,
  aria,
}: DropdownProps<T>) => {
  // Theme and styling
  const { theme, isDarkMode } = useTheme();
  
  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  
  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Virtual list setup
  const rowVirtualizer = useVirtual({
    size: options.length,
    parentRef: listboxRef,
    estimateSize: useCallback(() => virtualizationConfig.itemSize, []),
    overscan: virtualizationConfig.overscan,
  });

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      onSearch?.(query);
    }, 300),
    [onSearch]
  );

  // Handle option selection
  const handleSelect = useCallback((option: T) => {
    if (isMulti) {
      const newValue = Array.isArray(value) ? [...value] : [];
      const index = newValue.indexOf(option);
      
      if (index === -1) {
        newValue.push(option);
      } else {
        newValue.splice(index, 1);
      }
      
      onChange?.(newValue);
    } else {
      onChange?.(option);
      setIsOpen(false);
    }
  }, [isMulti, value, onChange]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case KEYS.ENTER:
      case KEYS.SPACE:
        if (activeIndex >= 0) {
          handleSelect(options[activeIndex]);
          event.preventDefault();
        }
        break;
        
      case KEYS.ARROW_UP:
        setActiveIndex(prev => Math.max(0, prev - 1));
        event.preventDefault();
        break;
        
      case KEYS.ARROW_DOWN:
        setActiveIndex(prev => Math.min(options.length - 1, prev + 1));
        event.preventDefault();
        break;
        
      case KEYS.HOME:
        setActiveIndex(0);
        event.preventDefault();
        break;
        
      case KEYS.END:
        setActiveIndex(options.length - 1);
        event.preventDefault();
        break;
        
      case KEYS.ESCAPE:
        setIsOpen(false);
        event.preventDefault();
        break;
    }
  }, [activeIndex, options, handleSelect]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus management
  useEffect(() => {
    if (isOpen && isSearchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, isSearchable]);

  // Generate dropdown classes
  const dropdownClasses = classnames(
    'relative inline-block w-full',
    {
      'opacity-50 cursor-not-allowed': disabled,
    },
    className
  );

  // Generate trigger button classes
  const triggerClasses = classnames(
    'w-full px-4 py-2 text-left',
    'border rounded-md shadow-sm',
    'transition-colors duration-200',
    {
      'border-error-500 bg-error-50': hasError,
      'border-primary-500': isOpen && !hasError,
      'border-gray-300': !isOpen && !hasError,
      'hover:border-primary-500': !disabled && !hasError,
      'dark:bg-gray-800 dark:border-gray-700': isDarkMode,
    }
  );

  // Generate options list classes
  const listboxClasses = classnames(
    'absolute w-full mt-1 py-1',
    'bg-white border border-gray-300 rounded-md shadow-lg',
    'max-h-[300px] overflow-auto z-50',
    'dark:bg-gray-800 dark:border-gray-700'
  );

  return (
    <div 
      ref={dropdownRef}
      className={dropdownClasses}
      onKeyDown={handleKeyDown}
    >
      <Button
        variant="tertiary"
        className={triggerClasses}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={ARIA.TRIGGER}
        aria-describedby={aria?.description}
        aria-invalid={hasError}
      >
        <span id={ARIA.TRIGGER} className="sr-only">{label}</span>
        <div className="flex items-center justify-between">
          <span className="truncate">
            {value ? (Array.isArray(value) ? `${value.length} selected` : value.toString()) : placeholder}
          </span>
          <span className="ml-2">
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
      </Button>

      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          id={ARIA.LISTBOX}
          className={listboxClasses}
          aria-multiselectable={isMulti}
          tabIndex={-1}
        >
          {isSearchable && (
            <div className="sticky top-0 p-2 bg-white dark:bg-gray-800">
              <input
                ref={searchInputRef}
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  debouncedSearch(e.target.value);
                }}
              />
            </div>
          )}

          <div
            style={{
              height: `${rowVirtualizer.totalSize}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.virtualItems.map(virtualRow => {
              const option = options[virtualRow.index];
              const isSelected = Array.isArray(value) 
                ? value.includes(option)
                : value === option;
              
              return (
                <div
                  key={virtualRow.index}
                  ref={virtualRow.measureRef}
                  className={classnames(
                    'absolute top-0 left-0 w-full',
                    'px-4 py-2 cursor-pointer',
                    {
                      'bg-primary-50 dark:bg-primary-900': isSelected,
                      'bg-gray-100 dark:bg-gray-700': activeIndex === virtualRow.index && !isSelected,
                      'hover:bg-gray-50 dark:hover:bg-gray-700': !isSelected,
                    }
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option)}
                >
                  {renderOption ? renderOption(option) : option.toString()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasError && errorMessage && (
        <p className="mt-1 text-sm text-error-500" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
});

Dropdown.displayName = 'Dropdown';

export default Dropdown;