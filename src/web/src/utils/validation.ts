/**
 * @fileoverview Enterprise-grade validation utilities for detection and intelligence data
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { z } from 'zod'; // v3.22.0+
import { memoize } from 'lodash'; // v4.17.21

// Internal imports
import { Detection, DetectionCreate, DetectionUpdate } from '../types/detection';
import { Intelligence, IntelligenceCreate, IntelligenceUpdate } from '../types/intelligence';

// Constants for validation configuration
const VALIDATION_CACHE_TTL = 900000; // 15 minutes in milliseconds
const MIN_ACCURACY_THRESHOLD = 0.9;
const MIN_COVERAGE_THRESHOLD = 0.85;

/**
 * Enhanced schema for performance metrics validation
 */
const performanceMetricsSchema = z.object({
  execution_time_ms: z.number().min(0),
  memory_usage_mb: z.number().min(0),
  false_positive_rate: z.number().min(0).max(1),
  coverage_score: z.number().min(0).max(1),
});

/**
 * Enhanced schema for MITRE ATT&CK mapping validation
 */
const mitreMappingSchema = z.record(
  z.string().regex(/^T[0-9]{4}(\.[0-9]{3})?$/),
  z.array(z.string())
);

/**
 * Comprehensive detection schema with enhanced validation
 */
export const detectionSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  metadata: z.record(z.unknown()),
  logic: z.record(z.unknown()).refine(
    (logic) => Object.keys(logic).length > 0,
    "Detection logic cannot be empty"
  ),
  mitre_mapping: mitreMappingSchema,
  performance_metrics: performanceMetricsSchema,
  status: z.enum(['draft', 'active', 'archived', 'deprecated']),
  platform: z.enum(['sigma', 'kql', 'spl', 'yara', 'chronicle']),
  tags: z.array(z.string()),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

/**
 * Enhanced intelligence schema with accuracy validation
 */
export const intelligenceSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  source_type: z.enum(['pdf', 'url', 'image', 'text', 'structured_data']),
  source_content: z.string().nullable(),
  source_url: z.string().url().nullable(),
  metadata: z.record(z.unknown()),
  processing_accuracy: z.number().min(0).max(1).nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'validation_error']),
});

/**
 * Interface for validation results with detailed metrics
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  metrics: {
    coverage_score?: number;
    accuracy_score?: number;
    performance_score?: number;
    validation_time_ms: number;
  };
}

/**
 * Validates detection data with enhanced MITRE mapping and performance validation
 * @param data Detection data to validate
 * @returns Validation result with detailed metrics
 */
export const validateDetection = memoize(
  (data: Detection | DetectionCreate | DetectionUpdate): ValidationResult => {
    const startTime = performance.now();
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      metrics: {
        validation_time_ms: 0
      }
    };

    try {
      // Schema validation
      const schemaValidation = detectionSchema.safeParse(data);
      if (!schemaValidation.success) {
        result.isValid = false;
        result.errors = schemaValidation.error.errors.map(err => err.message);
        return result;
      }

      // MITRE mapping validation
      const coverageScore = validateMitreMapping(data.mitre_mapping);
      result.metrics.coverage_score = coverageScore;
      
      if (coverageScore < MIN_COVERAGE_THRESHOLD) {
        result.isValid = false;
        result.errors.push(`MITRE coverage score ${coverageScore} below minimum threshold ${MIN_COVERAGE_THRESHOLD}`);
      }

      // Performance metrics validation
      if ('performance_metrics' in data) {
        const perfScore = validatePerformanceMetrics(data.performance_metrics);
        result.metrics.performance_score = perfScore;
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    } finally {
      result.metrics.validation_time_ms = performance.now() - startTime;
    }

    return result;
  },
  (data) => JSON.stringify(data),
  { maxAge: VALIDATION_CACHE_TTL }
);

/**
 * Validates intelligence data with enhanced accuracy checks
 * @param data Intelligence data to validate
 * @returns Validation result with accuracy metrics
 */
export const validateIntelligence = memoize(
  (data: Intelligence | IntelligenceCreate | IntelligenceUpdate): ValidationResult => {
    const startTime = performance.now();
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      metrics: {
        validation_time_ms: 0
      }
    };

    try {
      // Schema validation
      const schemaValidation = intelligenceSchema.safeParse(data);
      if (!schemaValidation.success) {
        result.isValid = false;
        result.errors = schemaValidation.error.errors.map(err => err.message);
        return result;
      }

      // Accuracy validation for processed intelligence
      if ('processing_accuracy' in data && data.processing_accuracy !== null) {
        result.metrics.accuracy_score = data.processing_accuracy;
        
        if (data.processing_accuracy < MIN_ACCURACY_THRESHOLD) {
          result.isValid = false;
          result.errors.push(`Processing accuracy ${data.processing_accuracy} below minimum threshold ${MIN_ACCURACY_THRESHOLD}`);
        }
      }

      // Source validation
      if (!data.source_content && !data.source_url) {
        result.isValid = false;
        result.errors.push('Either source_content or source_url must be provided');
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error.message}`);
    } finally {
      result.metrics.validation_time_ms = performance.now() - startTime;
    }

    return result;
  },
  (data) => JSON.stringify(data),
  { maxAge: VALIDATION_CACHE_TTL }
);

/**
 * Validates MITRE ATT&CK technique mappings with relationship checks
 * @param mapping MITRE technique mapping object
 * @returns Coverage score between 0 and 1
 */
export const validateMitreMapping = (mapping: Record<string, string[]>): number => {
  const techniquePattern = /^T[0-9]{4}(\.[0-9]{3})?$/;
  let validTechniques = 0;
  const totalTechniques = Object.keys(mapping).length;

  if (totalTechniques === 0) {
    return 0;
  }

  for (const [techniqueId, relationships] of Object.entries(mapping)) {
    if (
      techniquePattern.test(techniqueId) &&
      Array.isArray(relationships) &&
      relationships.length > 0
    ) {
      validTechniques++;
    }
  }

  return validTechniques / totalTechniques;
};

/**
 * Validates performance metrics for detections
 * @param metrics Performance metrics object
 * @returns Performance score between 0 and 1
 */
const validatePerformanceMetrics = (metrics: Record<string, number>): number => {
  const weights = {
    execution_time_ms: 0.4,
    memory_usage_mb: 0.3,
    false_positive_rate: 0.3
  };

  let score = 0;

  if (metrics.execution_time_ms <= 1000) score += weights.execution_time_ms;
  if (metrics.memory_usage_mb <= 500) score += weights.memory_usage_mb;
  if (metrics.false_positive_rate <= 0.01) score += weights.false_positive_rate;

  return score;
};