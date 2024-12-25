/**
 * @fileoverview Redux selectors for coverage analysis state management
 * Implements memoized selectors for performance-optimized state access
 * @version 1.0.0
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { RootState } from '../rootReducer';
import { CoverageState, CoverageMatrix, TacticCoverage, CoverageSummary } from './types';

/**
 * Base selector to get the coverage slice from root state
 * Provides type-safe access to coverage state
 */
export const selectCoverageState = (state: RootState): CoverageState => state.coverage;

/**
 * Memoized selector for coverage matrix data
 * Optimizes re-renders by maintaining referential equality
 */
export const selectCoverageMatrix = createSelector(
  [selectCoverageState],
  (coverageState): CoverageMatrix | null => coverageState.matrix
);

/**
 * Memoized selector for coverage loading state
 * Prevents unnecessary re-renders during async operations
 */
export const selectCoverageLoading = createSelector(
  [selectCoverageState],
  (coverageState): boolean => coverageState.loading
);

/**
 * Memoized selector for coverage error state
 * Provides type-safe error handling
 */
export const selectCoverageError = createSelector(
  [selectCoverageState],
  (coverageState): string | null => coverageState.error
);

/**
 * Memoized selector for coverage summary metrics
 * Computes derived state with performance optimization
 */
export const selectCoverageSummary = createSelector(
  [selectCoverageMatrix],
  (matrix): CoverageSummary | null => {
    if (!matrix) {
      return null;
    }

    const techniques = Object.values(matrix);
    const totalTechniques = techniques.length;
    const coveredTechniques = techniques.filter(
      technique => technique.coverage_percentage > 0
    ).length;

    return {
      totalTechniques,
      coveredTechniques,
      coveragePercentage: totalTechniques > 0 
        ? Math.round((coveredTechniques / totalTechniques) * 100)
        : 0,
      lastUpdated: Date.now()
    };
  }
);

/**
 * Memoized selector for tactic-level coverage metrics
 * Computes aggregated coverage data by MITRE tactic
 */
export const selectTacticCoverage = createSelector(
  [selectCoverageMatrix],
  (matrix): TacticCoverage[] | null => {
    if (!matrix) {
      return null;
    }

    // Group techniques by tactic
    const tacticMap = new Map<string, {
      total: number;
      covered: number;
      techniques: string[];
    }>();

    Object.entries(matrix).forEach(([techniqueId, coverage]) => {
      const tactic = coverage.metadata?.tactic;
      if (!tactic) return;

      const tacticData = tacticMap.get(tactic) || {
        total: 0,
        covered: 0,
        techniques: []
      };

      tacticData.total++;
      if (coverage.coverage_percentage > 0) {
        tacticData.covered++;
      }
      tacticData.techniques.push(techniqueId);

      tacticMap.set(tactic, tacticData);
    });

    // Convert map to sorted array
    return Array.from(tacticMap.entries())
      .map(([tactic, data]) => ({
        tactic,
        totalTechniques: data.total,
        coveredTechniques: data.covered,
        coveragePercentage: Math.round((data.covered / data.total) * 100),
        techniques: data.techniques
      }))
      .sort((a, b) => b.coveragePercentage - a.coveragePercentage);
  }
);

/**
 * Memoized selector for last update timestamp
 * Tracks coverage data freshness
 */
export const selectLastUpdated = createSelector(
  [selectCoverageState],
  (coverageState): number | null => coverageState.lastUpdated
);

/**
 * Memoized selector for validation errors
 * Provides access to coverage validation state
 */
export const selectValidationErrors = createSelector(
  [selectCoverageState],
  (coverageState): string[] => coverageState.validationErrors || []
);

/**
 * Memoized selector for coverage metrics by platform
 * Computes platform-specific coverage statistics
 */
export const selectPlatformCoverage = createSelector(
  [selectCoverageMatrix],
  (matrix): Record<string, number> | null => {
    if (!matrix) {
      return null;
    }

    const platformCoverage: Record<string, {
      total: number;
      covered: number;
    }> = {};

    Object.values(matrix).forEach(coverage => {
      const platform = coverage.metadata?.platform;
      if (!platform) return;

      if (!platformCoverage[platform]) {
        platformCoverage[platform] = { total: 0, covered: 0 };
      }

      platformCoverage[platform].total++;
      if (coverage.coverage_percentage > 0) {
        platformCoverage[platform].covered++;
      }
    });

    return Object.entries(platformCoverage).reduce(
      (acc, [platform, data]) => ({
        ...acc,
        [platform]: Math.round((data.covered / data.total) * 100)
      }),
      {}
    );
  }
);