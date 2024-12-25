// date-fns v2.30.0+ - Core date formatting and manipulation utilities
import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';

// Global constants for date formatting and handling
const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const ISO_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
const FALLBACK_DATE_STRING = 'Invalid Date';
const DEFAULT_LOCALE = enUS;

// Types for function parameters
interface DateFormatOptions {
  locale?: Locale;
  timeZone?: string;
}

interface RelativeTimeOptions {
  addSuffix?: boolean;
  locale?: Locale;
}

/**
 * Formats a date string or Date object into a standardized format with timezone handling
 * @param date - Input date as string, Date object, or null/undefined
 * @param formatString - Desired output format pattern
 * @param options - Optional formatting configuration
 * @returns Formatted date string or fallback value for invalid dates
 */
export const formatDate = (
  date: string | Date | null | undefined,
  formatString: string = DEFAULT_DATE_FORMAT,
  options: DateFormatOptions = {}
): string => {
  try {
    if (!date) {
      return FALLBACK_DATE_STRING;
    }

    const parsedDate = typeof date === 'string' ? parseISO(date) : date;
    
    if (!isValid(parsedDate)) {
      console.warn(`Invalid date provided: ${date}`);
      return FALLBACK_DATE_STRING;
    }

    // Apply timezone if provided
    let dateToFormat = parsedDate;
    if (options.timeZone) {
      dateToFormat = new Date(
        parsedDate.toLocaleString('en-US', { timeZone: options.timeZone })
      );
    }

    return format(dateToFormat, formatString, {
      locale: options.locale || DEFAULT_LOCALE,
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return FALLBACK_DATE_STRING;
  }
};

/**
 * Safely parses a date string into a Date object with enhanced error handling
 * @param dateString - Input date string or null/undefined
 * @param options - Optional parsing configuration
 * @returns Parsed Date object or null if invalid
 */
export const parseDate = (
  dateString: string | null | undefined,
  options: { timeZone?: string } = {}
): Date | null => {
  try {
    if (!dateString) {
      return null;
    }

    const parsedDate = parseISO(dateString);

    if (!isValid(parsedDate)) {
      console.warn(`Invalid date string provided: ${dateString}`);
      return null;
    }

    // Convert to specified timezone if provided
    if (options.timeZone) {
      return new Date(
        parsedDate.toLocaleString('en-US', { timeZone: options.timeZone })
      );
    }

    return parsedDate;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

/**
 * Formats a date relative to current time with accessibility support
 * @param date - Input date as string, Date object, or null/undefined
 * @param options - Optional formatting configuration
 * @returns Accessible relative time string with full date tooltip
 */
export const formatRelativeTime = (
  date: string | Date | null | undefined,
  options: RelativeTimeOptions = {}
): string => {
  try {
    if (!date) {
      return FALLBACK_DATE_STRING;
    }

    const parsedDate = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(parsedDate)) {
      console.warn(`Invalid date provided for relative time: ${date}`);
      return FALLBACK_DATE_STRING;
    }

    const fullDate = format(parsedDate, DEFAULT_DATE_FORMAT, {
      locale: options.locale || DEFAULT_LOCALE,
    });

    const relativeTime = formatDistanceToNow(parsedDate, {
      addSuffix: options.addSuffix,
      locale: options.locale || DEFAULT_LOCALE,
    });

    // Return formatted string with accessibility attributes
    return `<time datetime="${parsedDate.toISOString()}" 
      title="${fullDate}" 
      aria-label="${fullDate}">${relativeTime}</time>`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return FALLBACK_DATE_STRING;
  }
};

/**
 * Comprehensive date validation with detailed error reporting
 * @param date - Input date as string, Date object, or null/undefined
 * @returns Boolean indicating if the date is valid
 */
export const isValidDate = (date: string | Date | null | undefined): boolean => {
  try {
    if (!date) {
      return false;
    }

    const parsedDate = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(parsedDate)) {
      return false;
    }

    // Check for reasonable date range (between 1900 and 100 years from now)
    const year = parsedDate.getFullYear();
    const currentYear = new Date().getFullYear();
    const isReasonableYear = year >= 1900 && year <= currentYear + 100;

    if (!isReasonableYear) {
      console.warn(`Date outside reasonable range: ${date}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating date:', error);
    return false;
  }
};