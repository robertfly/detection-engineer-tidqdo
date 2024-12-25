/**
 * @fileoverview Test suite for DetectionEditor component
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import * as datadogRum from '@datadog/browser-rum';

// Internal imports
import { DetectionEditor } from '../../src/components/detection/DetectionEditor';
import { useDetection } from '../../src/hooks/useDetection';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { validateDetectionSyntax } from '../../src/utils/validation';

// Mock dependencies
jest.mock('@datadog/browser-rum');
jest.mock('../../src/hooks/useDetection');
jest.mock('../../src/utils/validation');

// Test constants
const VALIDATION_TIMEOUT = 5000;
const PERFORMANCE_THRESHOLD = 100;

// Mock data
const mockDetection = {
  id: 'test-detection-1',
  name: 'Test Detection',
  description: 'Test detection for unit tests',
  logic: {
    content: 'process where process.name = "malware.exe"',
    platform: 'sigma'
  },
  platform: 'sigma',
  status: 'draft',
  metadata: {},
  mitre_mapping: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

describe('DetectionEditor', () => {
  // Common test setup
  let mockOnChange: jest.Mock;
  let mockValidateDetection: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockOnChange = jest.fn();
    mockValidateDetection = jest.fn().mockResolvedValue({
      isValid: true,
      errors: []
    });

    (useDetection as jest.Mock).mockReturnValue({
      validateDetection: mockValidateDetection,
      updateDetection: jest.fn()
    });

    // Mock DataDog RUM
    (datadogRum.addTiming as jest.Mock).mockImplementation(() => {});
  });

  // Helper function to render with theme context
  const renderWithTheme = (props = {}) => {
    return render(
      <ThemeProvider>
        <DetectionEditor
          detection={mockDetection}
          onChange={mockOnChange}
          {...props}
        />
      </ThemeProvider>
    );
  };

  describe('Rendering and Layout', () => {
    it('should render the editor with correct layout structure', () => {
      const { container } = renderWithTheme();
      
      expect(container.querySelector('.detection-editor')).toBeInTheDocument();
      expect(container.querySelector('.detection-editor__content')).toBeInTheDocument();
      expect(container.querySelector('.detection-editor__validation')).toBeInTheDocument();
    });

    it('should apply correct theme styles', () => {
      const { container } = renderWithTheme();
      const editor = container.querySelector('.detection-editor');
      
      const computedStyle = window.getComputedStyle(editor!);
      expect(computedStyle.backgroundColor).toBe('#FFFFFF'); // Light theme default
    });

    it('should render in read-only mode when specified', () => {
      renderWithTheme({ readOnly: true });
      const editor = screen.getByRole('region', { name: /detection rule editor/i });
      
      expect(editor).toHaveAttribute('aria-readonly', 'true');
    });
  });

  describe('Editing and Validation', () => {
    it('should trigger validation on content change with debounce', async () => {
      const { container } = renderWithTheme();
      const editor = container.querySelector('.detection-editor__content');
      
      // Simulate typing
      fireEvent.change(editor!, { target: { value: 'new detection content' }});
      
      // Wait for debounce
      await waitFor(() => {
        expect(mockValidateDetection).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });

    it('should display validation errors when validation fails', async () => {
      mockValidateDetection.mockResolvedValueOnce({
        isValid: false,
        errors: ['Invalid detection syntax']
      });

      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'invalid content' }});
      
      // Check error display
      await waitFor(() => {
        expect(screen.getByText('Invalid detection syntax')).toBeInTheDocument();
      });
    });

    it('should track validation performance', async () => {
      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        expect(datadogRum.addTiming).toHaveBeenCalledWith(
          'detection_validation',
          expect.any(Number)
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      renderWithTheme();
      
      expect(screen.getByRole('region', { name: /detection rule editor/i })).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithTheme();
      
      const editor = screen.getByRole('textbox');
      await user.tab();
      
      expect(editor).toHaveFocus();
    });

    it('should announce validation status changes', async () => {
      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        const status = screen.getByRole('status');
        expect(status).toHaveTextContent(/validating|valid|invalid/i);
      });
    });
  });

  describe('Performance', () => {
    it('should complete validation within performance threshold', async () => {
      const startTime = performance.now();
      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(VALIDATION_TIMEOUT);
      });
    });

    it('should log performance warnings when thresholds are exceeded', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');
      mockValidateDetection.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, PERFORMANCE_THRESHOLD + 50));
        return { isValid: true, errors: [] };
      });

      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('exceeded performance threshold'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      mockValidateDetection.mockRejectedValueOnce(new Error('Validation failed'));
      renderWithTheme();
      
      // Trigger validation
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
      });
    });

    it('should recover from validation errors on subsequent attempts', async () => {
      mockValidateDetection
        .mockRejectedValueOnce(new Error('Validation failed'))
        .mockResolvedValueOnce({ isValid: true, errors: [] });

      renderWithTheme();
      
      // First validation attempt
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test content' }});
      
      await waitFor(() => {
        expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
      });

      // Second validation attempt
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'valid content' }});
      
      await waitFor(() => {
        expect(screen.queryByText(/validation failed/i)).not.toBeInTheDocument();
      });
    });
  });
});