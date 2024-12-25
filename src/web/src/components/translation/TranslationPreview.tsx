// React v18.2.0
import React, { useMemo } from 'react';
// classnames v2.3.0
import classNames from 'classnames';
// Internal imports
import { Translation, TranslationPlatform, TranslationStatus } from '../../types/translation';
import Card from '../common/Card';
import CodeEditor from '../workbench/CodeEditor';
import ErrorBoundary from '../common/ErrorBoundary';

/**
 * Props interface for TranslationPreview component
 */
export interface TranslationPreviewProps {
  /** Translation object containing platform, status, and translated logic */
  translation: Translation;
  /** Optional CSS class name for styling customization */
  className?: string;
  /** Optional Material Design elevation level (1-5) */
  elevation?: number;
}

/**
 * Maps translation platform to Monaco editor language identifier
 * @param platform - The translation platform enum value
 * @returns Appropriate Monaco editor language identifier
 */
const getLanguageForPlatform = (platform: TranslationPlatform): string => {
  switch (platform) {
    case TranslationPlatform.SIGMA:
      return 'yaml';
    case TranslationPlatform.KQL:
      return 'kusto';
    case TranslationPlatform.SPL:
      return 'splunk';
    case TranslationPlatform.YARA_L:
      return 'yara';
    default:
      return 'plaintext';
  }
};

/**
 * Gets status indicator color based on translation status
 * @param status - The current translation status
 * @returns Material Design color token
 */
const getStatusColor = (status: TranslationStatus): string => {
  switch (status) {
    case TranslationStatus.COMPLETED:
      return 'text-success-main dark:text-success-light';
    case TranslationStatus.FAILED:
    case TranslationStatus.VALIDATION_FAILED:
      return 'text-error-main dark:text-error-light';
    case TranslationStatus.IN_PROGRESS:
      return 'text-info-main dark:text-info-light';
    case TranslationStatus.PENDING:
      return 'text-warning-main dark:text-warning-light';
    default:
      return 'text-text-secondary dark:text-text-secondary-dark';
  }
};

/**
 * TranslationPreview component for displaying translated detection rules
 * with proper formatting and syntax highlighting
 */
export const TranslationPreview: React.FC<TranslationPreviewProps> = React.memo(({
  translation,
  className,
  elevation = 1
}) => {
  // Memoize the editor language based on platform
  const editorLanguage = useMemo(() => 
    getLanguageForPlatform(translation.platform),
    [translation.platform]
  );

  // Memoize the status color
  const statusColor = useMemo(() => 
    getStatusColor(translation.status),
    [translation.status]
  );

  // Base component classes
  const baseClasses = classNames(
    'preview-container',
    className
  );

  return (
    <ErrorBoundary>
      <Card
        className={baseClasses}
        elevation={elevation}
        role="region"
        ariaLabel={`Translation preview for ${translation.platform}`}
      >
        {/* Header with platform and status */}
        <div className="preview-header">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {translation.platform}
            </span>
            <span className={classNames('preview-status', statusColor)}>
              {translation.status}
            </span>
          </div>
          {translation.metadata && (
            <div className="text-sm text-text-secondary dark:text-text-secondary-dark">
              Version: {translation.metadata.version}
            </div>
          )}
        </div>

        {/* Code editor with translation content */}
        <div className="preview-content">
          <CodeEditor
            value={translation.translated_logic}
            language={editorLanguage}
            readOnly={true}
            onChange={() => {}} // No-op for read-only view
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              wrappingStrategy: 'advanced',
              folding: true,
              renderLineHighlight: 'all',
              contextmenu: false,
              quickSuggestions: false,
              parameterHints: { enabled: false },
              suggestOnTriggerCharacters: false,
              acceptSuggestionOnEnter: 'off',
              tabCompletion: 'off',
              wordBasedSuggestions: false,
              accessibilitySupport: 'on'
            }}
          />
        </div>

        {/* Error message display if translation failed */}
        {(translation.status === TranslationStatus.FAILED || 
          translation.status === TranslationStatus.VALIDATION_FAILED) && 
          translation.error_message && (
          <div 
            className="p-4 bg-error-light/10 dark:bg-error-dark/10 text-error-main dark:text-error-light"
            role="alert"
          >
            {translation.error_message}
          </div>
        )}
      </Card>
    </ErrorBoundary>
  );
});

// Display name for debugging
TranslationPreview.displayName = 'TranslationPreview';

// Default export
export default TranslationPreview;

// Styles
const styles = {
  'preview-container': [
    'flex flex-col',
    'h-full min-h-[200px]',
    'bg-background-primary dark:bg-background-primary-dark',
    'rounded-md overflow-hidden',
    'transition-shadow duration-200'
  ],
  'preview-header': [
    'flex items-center justify-between',
    'px-4 py-2',
    'border-b border-border-primary dark:border-border-primary-dark',
    'bg-background-secondary dark:bg-background-secondary-dark'
  ],
  'preview-content': [
    'flex-1 min-h-0',
    'relative',
    'focus-within:ring-2 focus-within:ring-primary'
  ],
  'preview-status': [
    'flex items-center gap-2',
    'text-sm font-medium',
    'text-text-secondary dark:text-text-secondary-dark'
  ]
};