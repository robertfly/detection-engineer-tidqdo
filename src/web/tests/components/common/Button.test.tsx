// Button.test.tsx
// Version: 1.0.0
// Comprehensive test suite for the Button component following Material Design 3.0 specifications

import React from 'react'; // v18.2+
import { render, fireEvent, screen, waitFor } from '@testing-library/react'; // v14.0+
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0+
import userEvent from '@testing-library/user-event'; // v14.0+
import Button, { ButtonProps } from '../../../src/components/common/Button';

// Mock the Loading component
jest.mock('../../../src/components/common/Loading', () => {
  return function MockLoading({ label }: { label: string }) {
    return <div data-testid="loading-indicator">{label}</div>;
  };
});

describe('Button Component', () => {
  // Common test utilities
  const mockOnClick = jest.fn();
  const mockOnLoadingTimeout = jest.fn();
  
  const defaultProps: ButtonProps = {
    children: 'Test Button',
    onClick: mockOnClick,
    variant: 'primary',
    size: 'medium',
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  // Rendering and Styling Tests
  describe('Rendering and Styling', () => {
    it('renders with default props', () => {
      render(<Button {...defaultProps} />);
      const button = screen.getByRole('button', { name: /test button/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-primary-600', 'text-white');
    });

    it('applies correct variant styles', () => {
      const variants = ['primary', 'secondary', 'tertiary', 'text'] as const;
      variants.forEach(variant => {
        const { rerender } = render(<Button {...defaultProps} variant={variant} />);
        const button = screen.getByRole('button');
        
        switch (variant) {
          case 'primary':
            expect(button).toHaveClass('bg-primary-600');
            break;
          case 'secondary':
            expect(button).toHaveClass('bg-secondary-100');
            break;
          case 'tertiary':
            expect(button).toHaveClass('border-gray-300');
            break;
          case 'text':
            expect(button).toHaveClass('bg-transparent');
            break;
        }
        rerender(<></>);
      });
    });

    it('applies correct size styles', () => {
      const sizes = ['small', 'medium', 'large'] as const;
      sizes.forEach(size => {
        const { rerender } = render(<Button {...defaultProps} size={size} />);
        const button = screen.getByRole('button');
        
        switch (size) {
          case 'small':
            expect(button).toHaveClass('text-sm', 'px-3', 'py-2');
            break;
          case 'medium':
            expect(button).toHaveClass('text-base', 'px-4', 'py-2');
            break;
          case 'large':
            expect(button).toHaveClass('text-lg', 'px-6', 'py-3');
            break;
        }
        rerender(<></>);
      });
    });

    it('applies fullWidth style correctly', () => {
      render(<Button {...defaultProps} fullWidth />);
      expect(screen.getByRole('button')).toHaveClass('w-full');
    });
  });

  // Accessibility Tests
  describe('Accessibility', () => {
    it('meets WCAG 2.1 AA requirements', () => {
      render(<Button {...defaultProps} />);
      const button = screen.getByRole('button');
      
      // Verify minimum touch target size
      const styles = window.getComputedStyle(button);
      expect(parseInt(styles.minWidth)).toBeGreaterThanOrEqual(44);
      expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(44);
    });

    it('handles keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<Button {...defaultProps} />);
      const button = screen.getByRole('button');

      // Tab navigation
      await user.tab();
      expect(button).toHaveFocus();

      // Space/Enter activation
      await user.keyboard('[Space]');
      expect(mockOnClick).toHaveBeenCalledTimes(1);
      
      await user.keyboard('[Enter]');
      expect(mockOnClick).toHaveBeenCalledTimes(2);
    });

    it('provides correct ARIA attributes', () => {
      render(
        <Button 
          {...defaultProps} 
          disabled={true}
          ariaLabel="Custom Label"
          role="menuitem"
        />
      );
      
      const button = screen.getByRole('menuitem');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-label', 'Custom Label');
    });
  });

  // Loading State Tests
  describe('Loading State', () => {
    it('displays loading indicator correctly', () => {
      render(<Button {...defaultProps} loading={true} />);
      
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
      expect(screen.getByText('Test Button')).toHaveClass('opacity-75');
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('handles loading timeout', () => {
      render(
        <Button 
          {...defaultProps} 
          loading={true}
          loadingTimeout={1000}
          onLoadingTimeout={mockOnLoadingTimeout}
        />
      );

      jest.advanceTimersByTime(1000);
      expect(mockOnLoadingTimeout).toHaveBeenCalledTimes(1);
    });

    it('cleans up loading timeout on unmount', () => {
      const { unmount } = render(
        <Button 
          {...defaultProps} 
          loading={true}
          loadingTimeout={1000}
          onLoadingTimeout={mockOnLoadingTimeout}
        />
      );

      unmount();
      jest.advanceTimersByTime(1000);
      expect(mockOnLoadingTimeout).not.toHaveBeenCalled();
    });
  });

  // Interaction Tests
  describe('User Interactions', () => {
    it('handles click events correctly', async () => {
      const user = userEvent.setup();
      render(<Button {...defaultProps} />);
      
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('prevents click when disabled', async () => {
      const user = userEvent.setup();
      render(<Button {...defaultProps} disabled />);
      
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('prevents click when loading', async () => {
      const user = userEvent.setup();
      render(<Button {...defaultProps} loading />);
      
      await user.click(screen.getByRole('button'));
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('handles click errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const errorOnClick = () => { throw new Error('Click error'); };
      const user = userEvent.setup();
      
      render(<Button {...defaultProps} onClick={errorOnClick} />);
      await user.click(screen.getByRole('button'));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Button click handler error:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // Error Handling Tests
  describe('Error Handling', () => {
    it('recovers from render errors', () => {
      const { rerender } = render(<Button {...defaultProps} />);
      
      // Test recovery from invalid props
      rerender(<Button {...defaultProps} variant={'invalid' as any} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('maintains accessibility during error states', () => {
      render(<Button {...defaultProps} disabled />);
      const button = screen.getByRole('button');
      
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });
});