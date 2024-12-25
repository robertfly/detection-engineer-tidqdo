/**
 * @fileoverview CoverageMatrix component implementing an accessible, responsive
 * visualization of MITRE ATT&CK coverage with virtualized scrolling support
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.0
import { useVirtualizer } from '@tanstack/react-virtual'; // v3.0.0
import TechniqueCard from './TechniqueCard';
import { Coverage, CoverageType } from '../../types/coverage';
import { useCoverage } from '../../hooks/useCoverage';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// Matrix data structure interface
interface MatrixData {
  tactics: string[];
  techniques: Record<string, Coverage[]>;
  metadata: {
    totalCount: number;
    coveredCount: number;
    coveragePercentage: number;
  };
}

// Component props interface
interface CoverageMatrixProps {
  libraryId: string;
  onTechniqueSelect?: (technique: Coverage) => void;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  ariaLabel?: string;
}

/**
 * Organizes coverage data into a matrix format with metadata
 * @param coverageData - Raw coverage data array
 * @returns Organized matrix data structure
 */
const organizeMatrixData = (coverageData: Coverage[]): MatrixData => {
  const tactics = new Set<string>();
  const techniques: Record<string, Coverage[]> = {};
  let totalCount = 0;
  let coveredCount = 0;

  // Process and organize coverage data
  coverageData.forEach(item => {
    if (item.type === CoverageType.TACTIC) {
      tactics.add(item.name);
    } else if (item.type === CoverageType.TECHNIQUE) {
      const tactic = item.metadata.tactic as string;
      if (!techniques[tactic]) {
        techniques[tactic] = [];
      }
      techniques[tactic].push(item);
      totalCount++;
      if (item.coverage_percentage > 0) {
        coveredCount++;
      }
    }
  });

  return {
    tactics: Array.from(tactics).sort(),
    techniques,
    metadata: {
      totalCount,
      coveredCount,
      coveragePercentage: totalCount > 0 ? (coveredCount / totalCount) * 100 : 0
    }
  };
};

/**
 * CoverageMatrix component renders an accessible matrix visualization of MITRE ATT&CK coverage
 */
const CoverageMatrix: React.FC<CoverageMatrixProps> = ({
  libraryId,
  onTechniqueSelect,
  className,
  initialFocusRef,
  ariaLabel
}) => {
  // State and refs
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const matrixRef = useRef<HTMLDivElement>(null);
  const { coverage, loading, error, analyzeLibrary } = useCoverage();

  // Process coverage data into matrix format
  const matrixData = useMemo(() => {
    return coverage ? organizeMatrixData(coverage) : null;
  }, [coverage]);

  // Setup virtualization
  const rowVirtualizer = useVirtualizer({
    count: matrixData?.tactics.length || 0,
    getScrollElement: () => matrixRef.current,
    estimateSize: () => 120,
    overscan: 5
  });

  // Load coverage data on mount
  useEffect(() => {
    analyzeLibrary(libraryId);
  }, [libraryId, analyzeLibrary]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!focusedCell || !matrixData) return;

    const { row, col } = focusedCell;
    const maxRow = matrixData.tactics.length - 1;
    const maxCol = Math.max(...Object.values(matrixData.techniques).map(t => t.length)) - 1;

    switch (event.key) {
      case 'ArrowUp':
        if (row > 0) setFocusedCell({ row: row - 1, col });
        event.preventDefault();
        break;
      case 'ArrowDown':
        if (row < maxRow) setFocusedCell({ row: row + 1, col });
        event.preventDefault();
        break;
      case 'ArrowLeft':
        if (col > 0) setFocusedCell({ row, col: col - 1 });
        event.preventDefault();
        break;
      case 'ArrowRight':
        if (col < maxCol) setFocusedCell({ row, col: col + 1 });
        event.preventDefault();
        break;
      case 'Enter':
      case ' ':
        const technique = matrixData.techniques[matrixData.tactics[row]]?.[col];
        if (technique && onTechniqueSelect) {
          onTechniqueSelect(technique);
        }
        event.preventDefault();
        break;
    }
  }, [focusedCell, matrixData, onTechniqueSelect]);

  // Error state
  if (error) {
    return (
      <div role="alert" className="text-error-500 p-4">
        Failed to load coverage data: {error.message}
      </div>
    );
  }

  // Loading state
  if (loading.analyze) {
    return (
      <div 
        role="status" 
        className="p-4"
        aria-label="Loading coverage matrix"
      >
        <div className={classNames('loadingSkeleton', 'h-96', 'w-full')} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div
        ref={matrixRef}
        className={classNames(
          'matrix',
          'overflow-x-auto',
          'min-w-full',
          'border-collapse',
          'border-spacing-0',
          className
        )}
        role="grid"
        aria-label={ariaLabel || 'MITRE ATT&CK Coverage Matrix'}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Header Row */}
        <div className={classNames('header', 'sticky top-0 bg-white dark:bg-gray-800 z-10')}>
          <div className="headerCell" role="columnheader">Tactics</div>
          <div className="headerCell" role="columnheader">Techniques</div>
        </div>

        {/* Virtualized Rows */}
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const tactic = matrixData?.tactics[virtualRow.index];
            const techniques = matrixData?.techniques[tactic] || [];

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={classNames('cell')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`
                }}
                role="row"
              >
                <div role="gridcell" className="p-2">
                  {tactic}
                </div>
                <div role="gridcell" className="p-2">
                  {techniques.map((technique, index) => (
                    <TechniqueCard
                      key={technique.id}
                      technique={technique}
                      onClick={onTechniqueSelect}
                      className={classNames('mb-2', {
                        'ring-2 ring-primary-500': focusedCell?.row === virtualRow.index && focusedCell?.col === index
                      })}
                      ariaLabel={`${technique.name} - Coverage: ${technique.coverage_percentage}%`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Coverage Summary */}
        {matrixData && (
          <div 
            role="complementary" 
            aria-label="Coverage Summary"
            className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Total Coverage: {matrixData.metadata.coveragePercentage.toFixed(1)}%
              ({matrixData.metadata.coveredCount} of {matrixData.metadata.totalCount} techniques)
            </p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

// Display name for debugging
CoverageMatrix.displayName = 'CoverageMatrix';

export default CoverageMatrix;