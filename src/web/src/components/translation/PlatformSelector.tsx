/**
 * PlatformSelector.tsx
 * Version: 1.0.0
 * A specialized Material Design 3.0 compliant select component for choosing 
 * the target platform when translating detections.
 */

import React, { useMemo, useCallback } from 'react';
import Select, { SelectProps } from '../common/Select';
import { TranslationPlatform } from '../../types/translation';
import { useTheme } from '../../hooks/useTheme';

// Platform display labels with descriptive names
const PLATFORM_LABELS: Record<TranslationPlatform, string> = {
  [TranslationPlatform.SIGMA]: 'SIGMA (Generic Format)',
  [TranslationPlatform.KQL]: 'Microsoft Sentinel KQL',
  [TranslationPlatform.SPL]: 'Splunk Search Processing Language',
  [TranslationPlatform.YARA_L]: 'YARA-L (Chronicle)'
};

// Detailed platform descriptions for accessibility and tooltips
const PLATFORM_DESCRIPTIONS: Record<TranslationPlatform, string> = {
  [TranslationPlatform.SIGMA]: 'Generic detection format for SIEM systems',
  [TranslationPlatform.KQL]: 'Native query language for Microsoft Sentinel',
  [TranslationPlatform.SPL]: 'Search language for Splunk Enterprise',
  [TranslationPlatform.YARA_L]: 'YARA-L format for Google Chronicle'
};

// Platform icons mapping for visual identification
const PLATFORM_ICONS: Record<TranslationPlatform, string> = {
  [TranslationPlatform.SIGMA]: '🔍',
  [TranslationPlatform.KQL]: '⚡',
  [TranslationPlatform.SPL]: '🔎',
  [TranslationPlatform.YARA_L]: '🔒'
};

// Props interface with comprehensive type safety
export interface PlatformSelectorProps {
  /** Currently selected platform */
  value: TranslationPlatform | null;
  /** Handler for platform selection changes */
  onChange: (platform: TranslationPlatform) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Error message */
  error?: string;
  /** Required field indicator */
  required?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Accessible label */
  ariaLabel?: string;
  /** Test ID for e2e testing */
  testId?: string;
}

/**
 * Generates enhanced select options from TranslationPlatform enum
 * with labels, descriptions, and metadata
 */
const getPlatformOptions = () => {
  return Object.values(TranslationPlatform).map(platform => ({
    value: platform,
    label: PLATFORM_LABELS[platform],
    description: PLATFORM_DESCRIPTIONS[platform],
    'aria-label': `${PLATFORM_LABELS[platform]} - ${PLATFORM_DESCRIPTIONS[platform]}`,
    icon: PLATFORM_ICONS[platform],
    disabled: false
  }));
};

/**
 * Enhanced Material Design 3.0 component for selecting translation target platform
 * with accessibility and analytics integration
 */
export const PlatformSelector = React.memo<PlatformSelectorProps>(({
  value,
  onChange,
  disabled = false,
  error,
  required = false,
  loading = false,
  ariaLabel = 'Select target platform for detection translation',
  testId = 'platform-selector'
}) => {
  // Theme context for styling
  const { theme, isDarkMode } = useTheme();

  // Memoize platform options to prevent unnecessary recalculations
  const platformOptions = useMemo(() => getPlatformOptions(), []);

  // Handle platform selection with type safety
  const handleChange = useCallback((selectedValue: any) => {
    if (selectedValue && Object.values(TranslationPlatform).includes(selectedValue)) {
      onChange(selectedValue as TranslationPlatform);
    }
  }, [onChange]);

  // Generate unique IDs for accessibility
  const selectId = `platform-select-${testId}`;
  const labelId = `platform-label-${testId}`;
  const descriptionId = `platform-description-${testId}`;

  return (
    <Select
      id={selectId}
      name="platform"
      label="Target Platform"
      options={platformOptions}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      required={required}
      isLoading={loading}
      error={error}
      placeholder="Select target platform"
      isSearchable={true}
      className="w-full"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      data-testid={testId}
    />
  );
});

// Display name for debugging
PlatformSelector.displayName = 'PlatformSelector';

// Default export with named exports for flexibility
export default PlatformSelector;
export type { PlatformSelectorProps };