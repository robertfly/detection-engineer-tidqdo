/**
 * @fileoverview Utility functions for formatting data across the frontend application
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { format as dateFormat } from 'date-fns'; // v2.30.0+
import { memoize } from 'lodash'; // v4.17.21+
import { IntlMessageFormat } from 'intl-messageformat'; // v10.5.0+

// Internal imports
import { ApiResponse, ApiStatus, ApiError } from '../types/api';
import { Detection } from '../types/detection';

/**
 * Formats API response data according to standardized structure
 * @template T - Type of the response data
 * @param data - Response payload
 * @param meta - Optional metadata
 * @returns Formatted API response object
 */
export function formatApiResponse<T>(
  data: T,
  meta?: Partial<ApiResponse<T>['meta']>
): ApiResponse<T> {
  return {
    status: 'success' as ApiStatus,
    data,
    meta: {
      version: process.env.REACT_APP_API_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      ...meta
    },
    errors: []
  };
}

/**
 * Formats detection data according to Universal Detection Format
 * @param detection - Detection object to format
 * @returns Formatted detection object
 */
export function formatDetection(detection: Detection): Detection {
  const formattedDetection: Detection = {
    ...detection,
    metadata: {
      ...detection.metadata,
      formatted_at: new Date().toISOString()
    },
    created_at: dateFormat(new Date(detection.created_at), 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx'),
    updated_at: dateFormat(new Date(detection.updated_at), 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx'),
    last_validated: detection.last_validated ? 
      dateFormat(new Date(detection.last_validated), 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx') : 
      null
  };

  // Format MITRE mappings to ensure consistent structure
  formattedDetection.mitre_mapping = Object.entries(detection.mitre_mapping)
    .reduce((acc, [key, values]) => ({
      ...acc,
      [key]: Array.isArray(values) ? values : [values]
    }), {});

  return formattedDetection;
}

/**
 * Formats numeric values with locale-specific formatting
 * @param value - Number to format
 * @param decimals - Optional decimal places
 * @param locale - Optional locale string
 * @returns Formatted number string
 */
export const formatNumber = memoize((
  value: number,
  decimals: number = 0,
  locale: string = navigator.language
): string => {
  if (!isFinite(value)) return '—';

  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  } catch (error) {
    console.error('Error formatting number:', error);
    return value.toString();
  }
});

/**
 * Formats numeric values as percentages with internationalization
 * @param value - Number to format as percentage
 * @param decimals - Optional decimal places
 * @param locale - Optional locale string
 * @returns Formatted percentage string
 */
export const formatPercentage = memoize((
  value: number,
  decimals: number = 1,
  locale: string = navigator.language
): string => {
  if (!isFinite(value)) return '—';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  } catch (error) {
    console.error('Error formatting percentage:', error);
    return `${value * 100}%`;
  }
});

/**
 * Formats byte values into human-readable sizes
 * @param bytes - Number of bytes
 * @param locale - Optional locale string
 * @param precision - Optional decimal precision
 * @returns Formatted byte string with unit
 */
export const formatBytes = memoize((
  bytes: number,
  locale: string = navigator.language,
  precision: number = 2
): string => {
  if (bytes === 0) return '0 B';
  if (!isFinite(bytes)) return '—';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const base = 1024;
  const exponent = Math.floor(Math.log(bytes) / Math.log(base));
  const value = bytes / Math.pow(base, exponent);

  try {
    const formatter = new IntlMessageFormat(
      `{value, number, ::precision-${precision}} {unit}`,
      locale
    );

    return formatter.format({
      value,
      unit: units[exponent]
    });
  } catch (error) {
    console.error('Error formatting bytes:', error);
    return `${value.toFixed(precision)} ${units[exponent]}`;
  }
});

/**
 * Type guard to check if a value is a valid number for formatting
 * @param value - Value to check
 * @returns Boolean indicating if value is valid for formatting
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}