/**
 * @fileoverview Test suite for format utility functions
 * @version 1.0.0
 * @package @detection-platform/web
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  formatApiResponse,
  formatDetection,
  formatNumber,
  formatPercentage,
  formatBytes
} from '../../src/utils/format';
import type { ApiResponse, ApiStatus } from '../../src/types/api';
import type { Detection } from '../../src/types/detection';

describe('formatApiResponse', () => {
  const mockDate = new Date('2024-01-19T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should format successful response with data', () => {
    const data = { id: '123', name: 'Test' };
    const response = formatApiResponse(data);

    expect(response).toEqual({
      status: 'success' as ApiStatus,
      data,
      meta: {
        version: expect.any(String),
        timestamp: mockDate.toISOString()
      },
      errors: []
    });
  });

  it('should include custom meta information', () => {
    const data = { id: '123' };
    const meta = { requestId: 'req-123', page: 1 };
    const response = formatApiResponse(data, meta);

    expect(response.meta).toEqual({
      version: expect.any(String),
      timestamp: mockDate.toISOString(),
      requestId: 'req-123',
      page: 1
    });
  });

  it('should handle empty data objects', () => {
    const response = formatApiResponse({});
    expect(response.data).toEqual({});
    expect(response.errors).toEqual([]);
  });

  it('should handle array data structures', () => {
    const data = [1, 2, 3];
    const response = formatApiResponse(data);
    expect(response.data).toEqual([1, 2, 3]);
  });
});

describe('formatDetection', () => {
  const mockDate = new Date('2024-01-19T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should format detection according to UDF specification', () => {
    const detection: Detection = {
      id: 'det-123',
      name: 'Test Detection',
      description: 'Test description',
      metadata: { author: 'test@example.com' },
      logic: { query: 'test query' },
      mitre_mapping: { 'T1055': ['001', '002'] },
      status: 'active',
      platform: 'sigma',
      creator_id: 'user-123',
      library_id: 'lib-123',
      validation_results: {},
      test_results: {},
      performance_metrics: {},
      last_validated: '2024-01-18T10:00:00.000Z',
      version: '1.0.0',
      previous_versions: [],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-18T00:00:00.000Z'
    };

    const formatted = formatDetection(detection);

    expect(formatted).toEqual({
      ...detection,
      metadata: {
        ...detection.metadata,
        formatted_at: mockDate.toISOString()
      },
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-18T00:00:00.000Z',
      last_validated: '2024-01-18T10:00:00.000Z',
      mitre_mapping: { 'T1055': ['001', '002'] }
    });
  });

  it('should handle complex MITRE mappings', () => {
    const detection: Detection = {
      ...getBasicDetection(),
      mitre_mapping: {
        'T1055': 'single',
        'T1059': ['001', '002', '003']
      }
    };

    const formatted = formatDetection(detection);
    expect(formatted.mitre_mapping).toEqual({
      'T1055': ['single'],
      'T1059': ['001', '002', '003']
    });
  });

  it('should handle missing last_validated field', () => {
    const detection: Detection = {
      ...getBasicDetection(),
      last_validated: null
    };

    const formatted = formatDetection(detection);
    expect(formatted.last_validated).toBeNull();
  });
});

describe('formatNumber', () => {
  const originalLanguage = navigator.language;

  beforeEach(() => {
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      configurable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'language', {
      value: originalLanguage,
      configurable: true
    });
  });

  it('should format integers correctly', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(-1234)).toBe('-1,234');
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle decimal precision', () => {
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
    expect(formatNumber(1234.5678, 0)).toBe('1,235');
    expect(formatNumber(1234.5678, 4)).toBe('1,234.5678');
  });

  it('should handle different locales', () => {
    expect(formatNumber(1234.56, 2, 'de-DE')).toBe('1.234,56');
    expect(formatNumber(1234.56, 2, 'fr-FR')).toBe('1 234,56');
  });

  it('should handle invalid numbers', () => {
    expect(formatNumber(Infinity)).toBe('—');
    expect(formatNumber(-Infinity)).toBe('—');
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('formatPercentage', () => {
  it('should format basic percentages', () => {
    expect(formatPercentage(0.1234)).toBe('12.3%');
    expect(formatPercentage(1)).toBe('100.0%');
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('should handle custom decimal precision', () => {
    expect(formatPercentage(0.1234, 2)).toBe('12.34%');
    expect(formatPercentage(0.1234, 0)).toBe('12%');
    expect(formatPercentage(0.1234, 3)).toBe('12.340%');
  });

  it('should handle different locales', () => {
    expect(formatPercentage(0.1234, 1, 'de-DE')).toBe('12,3%');
    expect(formatPercentage(0.1234, 1, 'ar-SA')).toBe('١٢٫٣٪');
  });

  it('should handle edge cases', () => {
    expect(formatPercentage(Infinity)).toBe('—');
    expect(formatPercentage(-Infinity)).toBe('—');
    expect(formatPercentage(NaN)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('should format byte values correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('should handle large values', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
  });

  it('should respect precision parameter', () => {
    expect(formatBytes(1536, 'en-US', 1)).toBe('1.5 KB');
    expect(formatBytes(1536, 'en-US', 3)).toBe('1.500 KB');
  });

  it('should handle different locales', () => {
    expect(formatBytes(1536, 'de-DE', 2)).toBe('1,50 KB');
    expect(formatBytes(1536, 'fr-FR', 2)).toBe('1,50 KB');
  });

  it('should handle edge cases', () => {
    expect(formatBytes(Infinity)).toBe('—');
    expect(formatBytes(-Infinity)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

// Helper function to create a basic detection object for testing
function getBasicDetection(): Detection {
  return {
    id: 'det-123',
    name: 'Test Detection',
    description: 'Test description',
    metadata: {},
    logic: {},
    mitre_mapping: {},
    status: 'active',
    platform: 'sigma',
    creator_id: 'user-123',
    library_id: 'lib-123',
    validation_results: {},
    test_results: {},
    performance_metrics: {},
    last_validated: '2024-01-18T10:00:00.000Z',
    version: '1.0.0',
    previous_versions: [],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-18T00:00:00.000Z'
  };
}