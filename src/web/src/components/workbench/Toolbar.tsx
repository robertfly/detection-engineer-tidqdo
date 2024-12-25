import React, { useCallback, useRef, useEffect } from 'react';
import classnames from 'classnames'; // v2.3.0
import { useHotkeys } from 'react-hotkeys-hook'; // v4.4.0
import { Button } from '../common/Button';
import { Tooltip } from '../common/Tooltip';
import { ErrorBoundary } from '../common/ErrorBoundary';

// Interface for toolbar action loading states
interface LoadingStates {
  validate: boolean;
  translate: boolean;
  save: boolean;
}

// Props interface for the Toolbar component
export interface ToolbarProps {
  onValidate: () => Promise<void>;
  onTranslate: () => Promise<void>;
  onSave: () => Promise<void>;
  loading: LoadingStates;
  isValid: boolean;
  hasChanges: boolean;
  platform: string;
  className?: string;
}

// Action timeout duration (30 seconds)
const ACTION_TIMEOUT = 30000;

/**
 * Custom hook for managing toolbar action states and handlers
 */
export const useToolbarActions = (props: ToolbarProps) => {
  const timeoutRefs = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(timeoutRefs.current).forEach(clearTimeout);
    };
  }, []);

  // Action handler with timeout and error handling
  const createActionHandler = useCallback(
    (action: keyof LoadingStates, handler: () => Promise<void>) => async () => {
      try {
        // Clear existing timeout
        if (timeoutRefs.current[action]) {
          clearTimeout(timeoutRefs.current[action]);
        }

        // Set new timeout
        timeoutRefs.current[action] = setTimeout(() => {
          console.error(`${action} action timed out`);
          // Could trigger a Toast notification here
        }, ACTION_TIMEOUT);

        await handler();
      } catch (error) {
        console.error(`${action} action failed:`, error);
        // Could trigger error handling here
      } finally {
        // Clear timeout on completion
        if (timeoutRefs.current[action]) {
          clearTimeout(timeoutRefs.current[action]);
        }
      }
    },
    []
  );

  return {
    handleValidate: createActionHandler('validate', props.onValidate),
    handleTranslate: createActionHandler('translate', props.onTranslate),
    handleSave: createActionHandler('save', props.onSave),
  };
};

/**
 * Toolbar component providing quick actions for detection management
 */
const Toolbar: React.FC<ToolbarProps> = React.memo(({
  onValidate,
  onTranslate,
  onSave,
  loading,
  isValid,
  hasChanges,
  platform,
  className,
}) => {
  const { handleValidate, handleTranslate, handleSave } = useToolbarActions({
    onValidate,
    onTranslate,
    onSave,
    loading,
    isValid,
    hasChanges,
    platform,
  });

  // Setup keyboard shortcuts
  useHotkeys('ctrl+s, cmd+s', (event) => {
    event.preventDefault();
    if (hasChanges && !loading.save) {
      handleSave();
    }
  }, [hasChanges, loading.save, handleSave]);

  useHotkeys('ctrl+alt+v', (event) => {
    event.preventDefault();
    if (!loading.validate) {
      handleValidate();
    }
  }, [loading.validate, handleValidate]);

  return (
    <ErrorBoundary>
      <div
        className={classnames(
          // Base classes
          'toolbar',
          'flex',
          'items-center',
          'justify-end',
          'gap-4',
          'p-4',
          'bg-background-secondary',
          'border-t',
          'border-border-primary',
          'transition-all',
          'duration-200',
          'print:hidden',
          className
        )}
        role="toolbar"
        aria-label="Detection actions"
      >
        <div className="flex items-center gap-2 rtl:flex-row-reverse">
          <Tooltip
            content={`Validate detection${!hasChanges ? ' (no changes)' : ''}`}
            position="top"
            className="z-50 max-w-xs bg-background-tooltip text-sm text-text-primary"
          >
            <Button
              variant="secondary"
              size="medium"
              onClick={handleValidate}
              loading={loading.validate}
              disabled={loading.validate || !hasChanges}
              ariaLabel="Validate detection"
            >
              Validate
            </Button>
          </Tooltip>

          <Tooltip
            content={`Translate to ${platform}${!isValid ? ' (detection not valid)' : ''}`}
            position="top"
            className="z-50 max-w-xs bg-background-tooltip text-sm text-text-primary"
          >
            <Button
              variant="secondary"
              size="medium"
              onClick={handleTranslate}
              loading={loading.translate}
              disabled={loading.translate || !isValid}
              ariaLabel={`Translate detection to ${platform}`}
            >
              Translate
            </Button>
          </Tooltip>

          <Tooltip
            content={`Save changes${!hasChanges ? ' (no changes)' : ''}`}
            position="top"
            className="z-50 max-w-xs bg-background-tooltip text-sm text-text-primary"
          >
            <Button
              variant="primary"
              size="medium"
              onClick={handleSave}
              loading={loading.save}
              disabled={loading.save || !hasChanges}
              ariaLabel="Save detection"
            >
              Save
            </Button>
          </Tooltip>
        </div>
      </div>
    </ErrorBoundary>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;