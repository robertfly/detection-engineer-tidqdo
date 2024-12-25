/**
 * @fileoverview Test suite for IntelligenceUpload component
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import '@testing-library/jest-dom';

// Component and dependencies
import IntelligenceUpload from '../../src/components/intelligence/IntelligenceUpload';
import { createIntelligence } from '../../src/services/api/intelligence';

// Mock API service
jest.mock('../../src/services/api/intelligence');

// Test constants based on technical specifications
const ACCURACY_THRESHOLDS = {
  pdf: 90, // 90% for PDF processing
  url: 95, // 95% for URL scraping
  image: 85, // 85% for image analysis
  text: 98, // 98% for text analysis
  structured_data: 99 // 99% for structured data
};

const PROCESSING_TIMEOUT = 120000; // 2 minutes as per specs

describe('IntelligenceUpload Component', () => {
  // Setup test environment
  const mockOnUploadComplete = jest.fn();
  const mockOnUploadError = jest.fn();

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (createIntelligence as jest.Mock).mockReset();
  });

  // File Upload Tests
  describe('File Upload Functionality', () => {
    test('should handle PDF upload with accuracy validation', async () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const mockResponse = {
        id: '123',
        processing_accuracy: 92,
        processing_time: 45000,
        status: 'completed'
      };

      (createIntelligence as jest.Mock).mockResolvedValueOnce(mockResponse);

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          accuracyThresholds={ACCURACY_THRESHOLDS}
          processingTimeout={PROCESSING_TIMEOUT}
        />
      );

      const fileInput = screen.getByLabelText(/select files/i);
      await userEvent.upload(fileInput, mockFile);

      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(createIntelligence).toHaveBeenCalledWith(
          expect.objectContaining({
            source_type: 'pdf',
            metadata: expect.objectContaining({
              accuracyThreshold: ACCURACY_THRESHOLDS.pdf
            })
          })
        );
        expect(mockOnUploadComplete).toHaveBeenCalled();
      });
    });

    test('should reject PDF upload below accuracy threshold', async () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const mockResponse = {
        id: '123',
        processing_accuracy: 85, // Below 90% threshold
        processing_time: 45000,
        status: 'validation_error'
      };

      (createIntelligence as jest.Mock).mockRejectedValueOnce({
        code: 2001,
        message: 'Accuracy threshold not met',
        details: { accuracy: 85, threshold: 90 }
      });

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          accuracyThresholds={ACCURACY_THRESHOLDS}
        />
      );

      const fileInput = screen.getByLabelText(/select files/i);
      await userEvent.upload(fileInput, mockFile);

      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Accuracy threshold not met')
          })
        );
      });
    });
  });

  // URL Processing Tests
  describe('URL Processing Functionality', () => {
    test('should handle URL submission with accuracy validation', async () => {
      const testUrl = 'https://test.com/intel.html';
      const mockResponse = {
        id: '123',
        processing_accuracy: 96,
        processing_time: 30000,
        status: 'completed'
      };

      (createIntelligence as jest.Mock).mockResolvedValueOnce(mockResponse);

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          accuracyThresholds={ACCURACY_THRESHOLDS}
        />
      );

      const urlInput = screen.getByPlaceholderText(/enter url/i);
      await userEvent.type(urlInput, testUrl);
      fireEvent.keyDown(urlInput, { key: 'Enter' });

      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(createIntelligence).toHaveBeenCalledWith(
          expect.objectContaining({
            source_type: 'url',
            source_url: testUrl,
            metadata: expect.objectContaining({
              accuracyThreshold: ACCURACY_THRESHOLDS.url
            })
          })
        );
      });
    });
  });

  // Processing Time Tests
  describe('Processing Time Validation', () => {
    test('should handle processing timeout', async () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      
      (createIntelligence as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, PROCESSING_TIMEOUT + 1000))
      );

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
          processingTimeout={PROCESSING_TIMEOUT}
        />
      );

      const fileInput = screen.getByLabelText(/select files/i);
      await userEvent.upload(fileInput, mockFile);

      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('timeout')
          })
        );
      });
    });
  });

  // Accessibility Tests
  describe('Accessibility Compliance', () => {
    test('should meet WCAG 2.1 AA requirements', async () => {
      const { container } = render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
        />
      );

      // Check for proper ARIA labels
      expect(screen.getByLabelText(/select files/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/enter url/i)).toBeInTheDocument();

      // Verify keyboard navigation
      const fileInput = screen.getByLabelText(/select files/i);
      const urlInput = screen.getByLabelText(/enter url/i);
      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });

      fileInput.focus();
      expect(document.activeElement).toBe(fileInput);

      userEvent.tab();
      expect(document.activeElement).toBe(urlInput);

      userEvent.tab();
      expect(document.activeElement).toBe(uploadButton);

      // Check for proper role attributes
      expect(screen.getByRole('button', { name: /process intelligence/i })).toBeInTheDocument();
    });
  });

  // Error Handling Tests
  describe('Error Handling', () => {
    test('should display validation errors', async () => {
      const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
        />
      );

      const fileInput = screen.getByLabelText(/select files/i);
      await userEvent.upload(fileInput, invalidFile);

      expect(screen.getByRole('alert')).toHaveTextContent(/file type.*is not supported/i);
    });

    test('should handle network errors gracefully', async () => {
      const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      
      (createIntelligence as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      render(
        <IntelligenceUpload
          onUploadComplete={mockOnUploadComplete}
          onUploadError={mockOnUploadError}
        />
      );

      const fileInput = screen.getByLabelText(/select files/i);
      await userEvent.upload(fileInput, mockFile);

      const uploadButton = screen.getByRole('button', { name: /process intelligence/i });
      await userEvent.click(uploadButton);

      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalledWith(expect.any(Error));
        expect(screen.getByRole('alert')).toHaveTextContent(/upload failed/i);
      });
    });
  });
});