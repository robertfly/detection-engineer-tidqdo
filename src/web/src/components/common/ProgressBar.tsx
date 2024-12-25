// React 18.2.0+
import React from 'react';
// Material UI 5.0.0+
import { styled } from '@mui/material/styles';
import LinearProgress from '@mui/material/LinearProgress';
import { Theme } from '../../config/theme';

// Interface for component props with full TypeScript support
interface ProgressBarProps {
  /** Progress value between 0-100 */
  value?: number;
  /** Semantic variant for color indication */
  variant?: 'success' | 'warning' | 'error';
  /** Size variant affecting height */
  size?: 'small' | 'medium' | 'large';
  /** Indeterminate state for unknown progress */
  indeterminate?: boolean;
  /** Accessibility label */
  ariaLabel?: string;
  /** Optional className for styling */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

/**
 * Calculates the semantic color based on progress value and variant
 * Ensures WCAG 2.1 AA compliance for color contrast
 */
const getProgressColor = (value: number, variant: string | undefined, theme: Theme) => {
  // If variant is provided, use semantic colors
  if (variant) {
    switch (variant) {
      case 'success':
        return theme.palette.success.main;
      case 'warning':
        return theme.palette.warning.main;
      case 'error':
        return theme.palette.error.main;
      default:
        return theme.palette.primary.main;
    }
  }

  // Calculate color based on value ranges if no variant specified
  if (value <= 33) {
    return theme.palette.error.main;
  } else if (value <= 66) {
    return theme.palette.warning.main;
  }
  return theme.palette.success.main;
};

/**
 * Styled wrapper for Material UI LinearProgress with enhanced customization
 * Implements Material Design 3.0 specifications
 */
const StyledProgressBar = styled(LinearProgress, {
  shouldForwardProp: (prop) => 
    !['size', 'variant', 'indeterminate', 'ariaLabel'].includes(prop as string),
})<ProgressBarProps>(({ theme, size = 'medium', value, variant }) => ({
  // Size-based height calculations with minimum touch targets
  height: (() => {
    switch (size) {
      case 'small':
        return theme.spacing(0.5); // 4px
      case 'large':
        return theme.spacing(1.5); // 12px
      default:
        return theme.spacing(1); // 8px
    }
  })(),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.mode === 'light' 
    ? theme.palette.grey[200] 
    : theme.palette.grey[800],
  
  // Bar styling with semantic colors
  '& .MuiLinearProgress-bar': {
    backgroundColor: getProgressColor(value || 0, variant, theme),
    borderRadius: theme.shape.borderRadius,
    transition: theme.transitions.create(['transform', 'backgroundColor'], {
      duration: theme.transitions.duration.standard,
    }),
  },

  // Accessibility focus styles
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

/**
 * ProgressBar Component
 * 
 * A reusable progress bar component that implements Material Design 3.0 styling
 * with support for semantic states, multiple sizes, and accessibility features.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value = 0,
  variant,
  size = 'medium',
  indeterminate = false,
  ariaLabel,
  className,
  style,
}) => {
  // Ensure value is within valid range
  const normalizedValue = Math.min(Math.max(value, 0), 100);

  return (
    <StyledProgressBar
      variant={indeterminate ? 'indeterminate' : 'determinate'}
      value={normalizedValue}
      size={size}
      variant={variant}
      aria-label={ariaLabel}
      aria-valuenow={indeterminate ? undefined : normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      role="progressbar"
      className={className}
      style={style}
    />
  );
};

// Default export for the component
export default ProgressBar;