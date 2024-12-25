// React v18.2.0
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import AIChat, { AIChatProps } from './AIChat';
import CodeEditor, { CodeEditorProps } from './CodeEditor';

// Constants for split pane behavior
const MIN_PANE_SIZE = 200; // Minimum pane width in pixels
const DEFAULT_SPLIT = 50; // Default split percentage
const DRAG_UPDATE_INTERVAL = 16.67; // 60fps for smooth animation
const LOCAL_STORAGE_KEY = 'workbench-split-position';

// Props interface for SplitPane component
export interface SplitPaneProps {
  /** Initial split percentage (0-100) */
  defaultSplit?: number;
  /** Minimum size in pixels for each pane */
  minSize?: number;
  /** Optional CSS class name for styling */
  className?: string;
  /** Split direction for layout flexibility */
  direction?: 'horizontal' | 'vertical';
  /** Enable split position persistence */
  persist?: boolean;
  /** Split change callback for parent updates */
  onChange?: (split: number) => void;
}

/**
 * Custom hook for optimized drag handling
 */
const useDragHandling = (config: {
  minSize: number;
  direction: 'horizontal' | 'vertical';
  containerRef: React.RefObject<HTMLDivElement>;
  onSplitChange: (split: number) => void;
}) => {
  const { minSize, direction, containerRef, onSplitChange } = config;
  const isDragging = useRef(false);
  const rafId = useRef<number>();

  const calculateSplit = useCallback((clientPosition: number) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const isRTL = document.dir === 'rtl';
    
    const containerSize = direction === 'horizontal' ? 
      containerRect.width : 
      containerRect.height;
    
    const position = direction === 'horizontal' ?
      (isRTL ? containerRect.right - clientPosition : clientPosition - containerRect.left) :
      clientPosition - containerRect.top;

    // Calculate split percentage with boundary constraints
    const split = Math.min(
      Math.max(
        (position / containerSize) * 100,
        (minSize / containerSize) * 100
      ),
      100 - (minSize / containerSize) * 100
    );

    return split;
  }, [direction, minSize]);

  const handleDragMove = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isDragging.current) return;

    const clientPosition = 'touches' in event ?
      (direction === 'horizontal' ? event.touches[0].clientX : event.touches[0].clientY) :
      (direction === 'horizontal' ? event.clientX : event.clientY);

    // Use requestAnimationFrame for smooth updates
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }

    rafId.current = requestAnimationFrame(() => {
      const newSplit = calculateSplit(clientPosition);
      if (newSplit !== undefined) {
        onSplitChange(newSplit);
      }
    });
  }, [direction, calculateSplit, onSplitChange]);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }

    // Clean up event listeners
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
  }, [handleDragMove]);

  const startDragging = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    isDragging.current = true;

    // Add event listeners for drag tracking
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
  }, [handleDragMove, handleDragEnd]);

  return { startDragging };
};

/**
 * SplitPane component implementing a resizable interface for the AI workbench
 * with accessibility features and performance optimizations
 */
const SplitPane: React.FC<SplitPaneProps> = React.memo(({
  defaultSplit = DEFAULT_SPLIT,
  minSize = MIN_PANE_SIZE,
  className = '',
  direction = 'horizontal',
  persist = true,
  onChange
}) => {
  // Refs for performance optimization
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(() => {
    if (persist) {
      const savedSplit = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedSplit ? parseFloat(savedSplit) : defaultSplit;
    }
    return defaultSplit;
  });

  // Handle split changes with persistence
  const handleSplitChange = useCallback((newSplit: number) => {
    setSplit(newSplit);
    if (persist) {
      localStorage.setItem(LOCAL_STORAGE_KEY, newSplit.toString());
    }
    onChange?.(newSplit);
  }, [persist, onChange]);

  // Initialize drag handling
  const { startDragging } = useDragHandling({
    minSize,
    direction,
    containerRef,
    onSplitChange: handleSplitChange
  });

  // Memoize style calculations for performance
  const containerStyle = useMemo(() => ({
    display: 'flex',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    height: '100%',
    position: 'relative' as const
  }), [direction]);

  const leftPaneStyle = useMemo(() => ({
    width: direction === 'horizontal' ? `${split}%` : '100%',
    height: direction === 'horizontal' ? '100%' : `${split}%`,
    minWidth: direction === 'horizontal' ? minSize : undefined,
    minHeight: direction === 'horizontal' ? undefined : minSize,
    transition: isDragging ? undefined : 'width 0.1s ease-out, height 0.1s ease-out'
  }), [direction, split, minSize]);

  const rightPaneStyle = useMemo(() => ({
    width: direction === 'horizontal' ? `${100 - split}%` : '100%',
    height: direction === 'horizontal' ? '100%' : `${100 - split}%`,
    minWidth: direction === 'horizontal' ? minSize : undefined,
    minHeight: direction === 'horizontal' ? undefined : minSize
  }), [direction, split, minSize]);

  const dividerStyle = useMemo(() => ({
    width: direction === 'horizontal' ? '4px' : '100%',
    height: direction === 'horizontal' ? '100%' : '4px',
    background: 'var(--divider-color, #BDC3C7)',
    cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
    userSelect: 'none' as const,
    touchAction: 'none' as const
  }), [direction]);

  return (
    <div
      ref={containerRef}
      className={`split-pane ${className}`}
      style={containerStyle}
      role="group"
      aria-label="Split pane interface"
    >
      <div className="split-pane__left" style={leftPaneStyle}>
        <AIChat />
      </div>
      
      <div
        className="split-pane__divider"
        style={dividerStyle}
        onMouseDown={startDragging}
        onTouchStart={startDragging}
        role="separator"
        aria-valuenow={split}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-orientation={direction}
        tabIndex={0}
      />
      
      <div className="split-pane__right" style={rightPaneStyle}>
        <CodeEditor
          language="detection"
          value=""
          onChange={() => {}}
        />
      </div>
    </div>
  );
});

// Display name for debugging
SplitPane.displayName = 'SplitPane';

export default SplitPane;