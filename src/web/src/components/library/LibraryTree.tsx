/**
 * @fileoverview React component for rendering a hierarchical tree view of detection libraries
 * with enhanced security controls, real-time updates, and drag-and-drop functionality.
 * @version 1.0.0
 */

import React, { useEffect, useMemo, useCallback } from 'react';
import { Tree, TreeItem } from '@mui/lab'; // v5.0.0
import { VisibilityIcon, LockIcon, PublicIcon } from '@mui/icons-material'; // v5.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0

// Internal imports
import { Library } from '../../types/library';
import { useLibrary } from '../../hooks/useLibrary';

// Types
interface LibraryTreeProps {
  onSelect: (libraryId: string) => void;
  selectedId: string | null;
  draggable?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Component for rendering a hierarchical tree view of detection libraries
 * Implements security controls and drag-and-drop functionality
 */
const LibraryTree: React.FC<LibraryTreeProps> = ({
  onSelect,
  selectedId,
  draggable = false,
  onError
}) => {
  const {
    libraries,
    loading,
    error,
    fetchLibraries,
    updateLibrary,
    validateAccess
  } = useLibrary();

  // Fetch libraries on component mount
  useEffect(() => {
    const loadLibraries = async () => {
      try {
        await fetchLibraries();
      } catch (err) {
        onError?.(err as Error);
      }
    };
    loadLibraries();
  }, [fetchLibraries, onError]);

  /**
   * Get appropriate visibility icon based on library settings
   */
  const getVisibilityIcon = useCallback((library: Library) => {
    switch (library.visibility) {
      case 'public':
        return <PublicIcon color="primary" />;
      case 'private':
        return <LockIcon color="error" />;
      default:
        return <VisibilityIcon color="action" />;
    }
  }, []);

  /**
   * Handle drag start event with security validation
   */
  const handleDragStart = useCallback((event: React.DragEvent, libraryId: string) => {
    if (!validateAccess(libraryId)) {
      event.preventDefault();
      onError?.(new Error('Unauthorized to modify library'));
      return;
    }

    event.dataTransfer.setData('application/json', JSON.stringify({
      id: libraryId,
      timestamp: Date.now()
    }));
  }, [validateAccess, onError]);

  /**
   * Handle drop event with security and validation checks
   */
  const handleDrop = useCallback(async (event: React.DragEvent, targetId: string) => {
    event.preventDefault();

    try {
      const data = JSON.parse(event.dataTransfer.getData('application/json'));
      const sourceId = data.id;

      // Validate access permissions
      if (!validateAccess(sourceId) || !validateAccess(targetId)) {
        throw new Error('Unauthorized to modify libraries');
      }

      // Update library hierarchy
      await updateLibrary(sourceId, {
        parentId: targetId,
        version: Date.now() // Optimistic locking
      });

    } catch (err) {
      onError?.(err as Error);
    }
  }, [validateAccess, updateLibrary, onError]);

  /**
   * Recursively build tree items from library data
   */
  const buildTreeItems = useMemo(() => {
    const buildItems = (parentId: string | null = null): JSX.Element[] => {
      return libraries
        .filter(lib => lib.parentId === parentId)
        .map(library => (
          <TreeItem
            key={library.id}
            nodeId={library.id}
            label={library.name}
            icon={getVisibilityIcon(library)}
            draggable={draggable && validateAccess(library.id)}
            onDragStart={(e) => handleDragStart(e, library.id)}
            onDrop={(e) => handleDrop(e, library.id)}
            onDragOver={(e) => e.preventDefault()}
          >
            {buildItems(library.id)}
          </TreeItem>
        ));
    };

    return buildItems();
  }, [libraries, draggable, validateAccess, handleDragStart, handleDrop, getVisibilityIcon]);

  if (loading) {
    return <div>Loading libraries...</div>;
  }

  if (error) {
    return <div>Error loading libraries: {error}</div>;
  }

  return (
    <ErrorBoundary
      fallback={<div>Error rendering library tree</div>}
      onError={onError}
    >
      <Tree
        selected={selectedId || ''}
        onNodeSelect={(_, nodeId) => onSelect(nodeId)}
        aria-label="Detection Libraries"
      >
        {buildTreeItems}
      </Tree>
    </ErrorBoundary>
  );
};

export default LibraryTree;