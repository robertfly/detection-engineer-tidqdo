/**
 * @fileoverview Intelligence Upload Component with enhanced validation and accessibility
 * @version 1.0.0
 * @package @detection-platform/web
 */

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '../common/Button';
import { createIntelligence } from '../../services/api/intelligence';
import type { IntelligenceCreate, IntelligenceSourceType } from '../../types/intelligence';

// Constants for file validation
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const SUPPORTED_FILE_TYPES = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/gif'],
  text: ['text/plain'],
  structured_data: ['application/json', 'text/csv']
};

// Accuracy thresholds as per technical specifications
const ACCURACY_THRESHOLDS = {
  pdf: 90, // 90% accuracy for PDF processing
  url: 95, // 95% accuracy for URL scraping
  image: 85, // 85% accuracy for image analysis
  text: 98, // 98% accuracy for text analysis
  structured_data: 99 // 99% accuracy for structured data
};

interface IntelligenceUploadProps {
  /** Callback when upload is complete */
  onUploadComplete: (intelligence: IntelligenceCreate) => void;
  /** Callback for upload errors */
  onUploadError: (error: Error) => void;
  /** Allowed source types */
  allowedTypes?: IntelligenceSourceType[];
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Custom accuracy thresholds */
  accuracyThresholds?: Partial<Record<IntelligenceSourceType, number>>;
  /** Processing timeout in milliseconds */
  processingTimeout?: number;
}

/**
 * Enhanced intelligence upload component with validation and accessibility features
 */
const IntelligenceUpload: React.FC<IntelligenceUploadProps> = ({
  onUploadComplete,
  onUploadError,
  allowedTypes = ['pdf', 'url', 'image', 'text', 'structured_data'],
  maxFileSize = MAX_FILE_SIZE,
  accuracyThresholds = ACCURACY_THRESHOLDS,
  processingTimeout = 120000 // 2 minutes as per specs
}) => {
  // Component state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const uploadTimeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Validates file type and size
   */
  const validateFile = (file: File): string[] => {
    const errors: string[] = [];
    
    if (file.size > maxFileSize) {
      errors.push(`File ${file.name} exceeds maximum size of ${maxFileSize / 1024 / 1024}MB`);
    }

    const fileType = Object.entries(SUPPORTED_FILE_TYPES)
      .find(([_, types]) => types.includes(file.type))?.[0] as IntelligenceSourceType | undefined;

    if (!fileType || !allowedTypes.includes(fileType)) {
      errors.push(`File type ${file.type} is not supported`);
    }

    return errors;
  };

  /**
   * Handles file selection from input
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const errors: string[] = [];

    const validFiles = files.filter(file => {
      const fileErrors = validateFile(file);
      errors.push(...fileErrors);
      return fileErrors.length === 0;
    });

    setSelectedFiles(prevFiles => [...prevFiles, ...validFiles]);
    setValidationErrors(errors);
  }, [maxFileSize, allowedTypes]);

  /**
   * Handles URL input
   */
  const handleUrlInput = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && urlInputRef.current?.value) {
      const url = urlInputRef.current.value.trim();
      
      try {
        new URL(url); // Validate URL format
        setUrls(prevUrls => [...prevUrls, url]);
        urlInputRef.current.value = '';
      } catch {
        setValidationErrors(['Invalid URL format']);
      }
    }
  }, []);

  /**
   * Processes file upload with progress tracking
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFiles.length && !urls.length) return;

    setIsUploading(true);
    setUploadProgress(0);
    setValidationErrors([]);

    try {
      // Set upload timeout
      uploadTimeoutRef.current = setTimeout(() => {
        setIsUploading(false);
        onUploadError(new Error(`Upload timeout after ${processingTimeout}ms`));
      }, processingTimeout);

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        
        const fileType = Object.entries(SUPPORTED_FILE_TYPES)
          .find(([_, types]) => types.includes(file.type))?.[0] as IntelligenceSourceType;

        const intelligence: IntelligenceCreate = {
          name: file.name,
          description: `Uploaded file: ${file.name}`,
          source_type: fileType!,
          source_url: null,
          source_content: null,
          metadata: {
            originalName: file.name,
            size: file.size,
            type: file.type,
            accuracyThreshold: accuracyThresholds[fileType!]
          }
        };

        await createIntelligence(intelligence);
        setUploadProgress(prev => prev + (100 / (selectedFiles.length + urls.length)));
      }

      for (const url of urls) {
        const intelligence: IntelligenceCreate = {
          name: `URL Intelligence: ${new URL(url).hostname}`,
          description: `Processed from URL: ${url}`,
          source_type: 'url',
          source_url: url,
          source_content: null,
          metadata: {
            accuracyThreshold: accuracyThresholds.url
          }
        };

        await createIntelligence(intelligence);
        setUploadProgress(prev => prev + (100 / (selectedFiles.length + urls.length)));
      }

      onUploadComplete({
        name: 'Batch Upload',
        description: `Processed ${selectedFiles.length} files and ${urls.length} URLs`,
        source_type: 'structured_data',
        source_url: null,
        source_content: null,
        metadata: {
          fileCount: selectedFiles.length,
          urlCount: urls.length
        }
      });

    } catch (error) {
      onUploadError(error as Error);
      setValidationErrors([`Upload failed: ${(error as Error).message}`]);
    } finally {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
      setIsUploading(false);
      setSelectedFiles([]);
      setUrls([]);
    }
  }, [selectedFiles, urls, processingTimeout, accuracyThresholds, onUploadComplete, onUploadError]);

  return (
    <div className="intelligence-upload p-4 border rounded-lg bg-white shadow-sm">
      {/* File Upload Section */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          accept={Object.values(SUPPORTED_FILE_TYPES).flat().join(',')}
          className="hidden"
          aria-label="Select files for upload"
          disabled={isUploading}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          variant="secondary"
          fullWidth
          ariaLabel="Select files for intelligence processing"
        >
          Select Files
        </Button>
      </div>

      {/* URL Input Section */}
      <div className="mb-4">
        <input
          ref={urlInputRef}
          type="url"
          className="w-full p-2 border rounded"
          placeholder="Enter URL and press Enter"
          onKeyDown={handleUrlInput}
          disabled={isUploading}
          aria-label="Enter URL for intelligence processing"
        />
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mb-4" role="list" aria-label="Selected files">
          {selectedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between py-2">
              <span>{file.name}</span>
              <span className="text-sm text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)}MB
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Selected URLs List */}
      {urls.length > 0 && (
        <div className="mb-4" role="list" aria-label="Selected URLs">
          {urls.map((url, index) => (
            <div key={index} className="py-2 break-all">
              {url}
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mb-4" role="progressbar" aria-valuenow={uploadProgress}>
          <div className="h-2 bg-gray-200 rounded">
            <div
              className="h-full bg-primary-600 rounded transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Processing... {uploadProgress.toFixed(0)}%
          </p>
        </div>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded"
          role="alert"
          aria-label="Upload errors"
        >
          {validationErrors.map((error, index) => (
            <p key={index} className="text-red-600 text-sm">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Upload Button */}
      <Button
        onClick={handleUpload}
        disabled={isUploading || (!selectedFiles.length && !urls.length)}
        loading={isUploading}
        variant="primary"
        fullWidth
        ariaLabel="Start intelligence processing"
      >
        {isUploading ? 'Processing...' : 'Process Intelligence'}
      </Button>
    </div>
  );
};

export default IntelligenceUpload;