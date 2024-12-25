/**
 * @fileoverview Enterprise-grade utility module for detection lifecycle management
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import dayjs from 'dayjs'; // v1.11.0+
import { memoize, merge, cloneDeep } from 'lodash'; // v4.17.21+

// Internal imports
import { 
  Detection, 
  DetectionCreate, 
  DetectionUpdate, 
  DetectionPlatform,
  DetectionStatus 
} from '../types/detection';
import { validateDetection, ValidationResult } from './validation';

// Constants
const PLATFORM_NAME_PREFIXES: Record<DetectionPlatform, string> = {
  sigma: 'SIGMA_',
  kql: 'KQL_',
  spl: 'SPL_',
  yara: 'YARA_',
  chronicle: 'CHRON_'
};

const MAX_NAME_LENGTH = 200;
const COVERAGE_CACHE_TTL = 900000; // 15 minutes
const MIN_COVERAGE_THRESHOLD = 0.85;

/**
 * Result type for function returns with error handling
 */
interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Options for detection updates
 */
interface UpdateOptions {
  validateMitre?: boolean;
  checkConflicts?: boolean;
  generateAudit?: boolean;
}

/**
 * Options for coverage calculation
 */
interface CoverageOptions {
  includeSubTechniques?: boolean;
  minCoverageThreshold?: number;
  validateRelationships?: boolean;
}

/**
 * Coverage calculation result with detailed metrics
 */
interface CoverageResult {
  overallScore: number;
  techniqueCount: number;
  tacticCount: number;
  coverage: {
    techniques: Record<string, boolean>;
    tactics: Record<string, number>;
  };
  gaps: string[];
  recommendations: string[];
}

/**
 * Formats detection name according to platform-specific rules with validation
 * @param name Raw detection name
 * @param platform Target detection platform
 * @returns Formatted name or error
 */
export function formatDetectionName(
  name: string,
  platform: DetectionPlatform
): Result<string> {
  try {
    // Input validation
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'Invalid detection name' };
    }

    // Sanitize input
    let formattedName = name
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();

    // Add platform prefix
    formattedName = `${PLATFORM_NAME_PREFIXES[platform]}${formattedName}`;

    // Validate length
    if (formattedName.length > MAX_NAME_LENGTH) {
      formattedName = formattedName.substring(0, MAX_NAME_LENGTH);
    }

    return { success: true, data: formattedName };
  } catch (error) {
    return { 
      success: false, 
      error: `Name formatting error: ${error.message}` 
    };
  }
}

/**
 * Creates a new detection draft with enterprise validation and defaults
 * @param initialData Initial detection data
 * @param options Validation options
 * @returns Validated detection draft or error
 */
export function createDetectionDraft(
  initialData: Partial<DetectionCreate>
): Result<DetectionCreate> {
  try {
    // Create draft with defaults
    const draft: DetectionCreate = {
      name: initialData.name || '',
      description: initialData.description || '',
      metadata: {
        created_by: initialData.metadata?.created_by || '',
        created_at: dayjs().toISOString(),
        version: '1.0.0',
        ...initialData.metadata
      },
      logic: initialData.logic || {},
      mitre_mapping: initialData.mitre_mapping || {},
      platform: initialData.platform || 'sigma',
      library_id: initialData.library_id || '',
      tags: initialData.tags || [],
      severity: initialData.severity || 'medium'
    };

    // Validate draft
    const validation = validateDetection(draft);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    return { success: true, data: draft };
  } catch (error) {
    return {
      success: false,
      error: `Draft creation error: ${error.message}`
    };
  }
}

/**
 * Prepares detection update with enhanced validation and conflict checking
 * @param detection Existing detection
 * @param changes Proposed changes
 * @param options Update options
 * @returns Validated update payload or error
 */
export function prepareDetectionUpdate(
  detection: Detection,
  changes: Partial<DetectionUpdate>,
  options: UpdateOptions = {}
): Result<DetectionUpdate> {
  try {
    // Deep clone to prevent mutations
    const currentData = cloneDeep(detection);
    const updateData = cloneDeep(changes);

    // Merge changes
    const mergedData = merge({}, currentData, updateData);

    // Validate update
    const validation = validateDetection(mergedData);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Update validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Check for conflicts if enabled
    if (options.checkConflicts) {
      const conflicts = checkUpdateConflicts(currentData, mergedData);
      if (conflicts.length > 0) {
        return {
          success: false,
          error: `Update conflicts detected: ${conflicts.join(', ')}`
        };
      }
    }

    // Generate audit trail if enabled
    if (options.generateAudit) {
      mergedData.metadata.audit_trail = [
        ...(currentData.metadata.audit_trail || []),
        {
          timestamp: dayjs().toISOString(),
          changes: Object.keys(changes),
          previous_version: currentData.version
        }
      ];
    }

    return { success: true, data: mergedData };
  } catch (error) {
    return {
      success: false,
      error: `Update preparation error: ${error.message}`
    };
  }
}

/**
 * Calculates detailed MITRE coverage with caching and performance optimization
 * @param mitreMappings MITRE technique mappings
 * @param options Coverage calculation options
 * @returns Detailed coverage metrics
 */
export const calculateMitreCoverage = memoize(
  (
    mitreMappings: Record<string, string[]>,
    options: CoverageOptions = {}
  ): CoverageResult => {
    const result: CoverageResult = {
      overallScore: 0,
      techniqueCount: 0,
      tacticCount: 0,
      coverage: {
        techniques: {},
        tactics: {}
      },
      gaps: [],
      recommendations: []
    };

    try {
      // Calculate technique coverage
      const techniques = Object.keys(mitreMappings);
      result.techniqueCount = techniques.length;

      techniques.forEach(technique => {
        const relationships = mitreMappings[technique];
        const isValid = validateTechnique(
          technique,
          relationships,
          options.validateRelationships
        );
        result.coverage.techniques[technique] = isValid;

        // Track tactic coverage
        relationships.forEach(tactic => {
          result.coverage.tactics[tactic] = 
            (result.coverage.tactics[tactic] || 0) + 1;
        });
      });

      // Calculate overall scores
      result.tacticCount = Object.keys(result.coverage.tactics).length;
      result.overallScore = calculateOverallCoverage(result.coverage);

      // Identify gaps and recommendations
      if (result.overallScore < (options.minCoverageThreshold || MIN_COVERAGE_THRESHOLD)) {
        result.gaps = identifyCoverageGaps(result.coverage);
        result.recommendations = generateRecommendations(result.gaps);
      }

      return result;
    } catch (error) {
      throw new Error(`Coverage calculation error: ${error.message}`);
    }
  },
  (mappings, options) => JSON.stringify({ mappings, options }),
  { maxAge: COVERAGE_CACHE_TTL }
);

/**
 * Validates MITRE technique ID and relationships
 * @private
 */
function validateTechnique(
  technique: string,
  relationships: string[],
  validateRelationships = true
): boolean {
  const techniquePattern = /^T[0-9]{4}(\.[0-9]{3})?$/;
  return (
    techniquePattern.test(technique) &&
    (!validateRelationships || (Array.isArray(relationships) && relationships.length > 0))
  );
}

/**
 * Calculates overall coverage score
 * @private
 */
function calculateOverallCoverage(
  coverage: CoverageResult['coverage']
): number {
  const validTechniques = Object.values(coverage.techniques)
    .filter(Boolean).length;
  const totalTechniques = Object.keys(coverage.techniques).length;

  return totalTechniques > 0 ? validTechniques / totalTechniques : 0;
}

/**
 * Identifies gaps in MITRE coverage
 * @private
 */
function identifyCoverageGaps(
  coverage: CoverageResult['coverage']
): string[] {
  return Object.entries(coverage.techniques)
    .filter(([, isValid]) => !isValid)
    .map(([technique]) => technique);
}

/**
 * Generates coverage improvement recommendations
 * @private
 */
function generateRecommendations(gaps: string[]): string[] {
  return gaps.map(technique => 
    `Add relationships for technique ${technique} to improve coverage`
  );
}

/**
 * Checks for conflicts in detection updates
 * @private
 */
function checkUpdateConflicts(
  current: Detection,
  updated: Partial<DetectionUpdate>
): string[] {
  const conflicts: string[] = [];

  // Check for version conflicts
  if (current.version !== updated.metadata?.version) {
    conflicts.push('Version mismatch');
  }

  // Check for status conflicts
  if (
    current.status === DetectionStatus.deprecated &&
    updated.status !== DetectionStatus.deprecated
  ) {
    conflicts.push('Cannot update deprecated detection');
  }

  return conflicts;
}