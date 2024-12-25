// React v18.2.0
import React, { useCallback, useEffect, useMemo } from 'react';
// @monaco-editor/react v4.6.0
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
// @monaco-editor/loader v1.4.0
import loader from '@monaco-editor/loader';
// Internal imports
import { useTheme } from '../../hooks/useTheme';

// Configure Monaco loader CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs'
  },
  'vs/nls': { availableLanguages: { '*': 'en' } }
});

// Types for Monaco editor configuration
interface MonacoOptions extends monaco.editor.IStandaloneEditorConstructionOptions {
  automaticLayout?: boolean;
  minimap?: { enabled: boolean };
  scrollBeyondLastLine?: boolean;
}

// Props interface for the CodeEditor component
interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  className?: string;
  theme?: string;
  options?: MonacoOptions;
  onValidation?: (markers: monaco.editor.IMarker[]) => void;
}

/**
 * Configures Monaco editor instance with enhanced features and Material Design theme
 * @param monaco - Monaco editor instance
 */
const configureMonaco = (monaco: typeof import('monaco-editor')): void => {
  // Register Material Design themes
  monaco.editor.defineTheme('material-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#2C3E50',
      'editor.lineHighlightBackground': '#F5F5F5',
      'editorCursor.foreground': '#1976D2',
      'editor.selectionBackground': '#BBDEFB',
      'editor.inactiveSelectionBackground': '#E3F2FD',
      'editorLineNumber.foreground': '#7F8C8D',
      'editorLineNumber.activeForeground': '#2C3E50',
    }
  });

  monaco.editor.defineTheme('material-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#FFFFFF',
      'editor.lineHighlightBackground': '#2C2C2C',
      'editorCursor.foreground': '#1976D2',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3E4451',
      'editorLineNumber.foreground': '#B2B2B2',
      'editorLineNumber.activeForeground': '#FFFFFF',
    }
  });

  // Register custom detection language features
  monaco.languages.register({ id: 'detection' });
  monaco.languages.setMonarchTokensProvider('detection', {
    tokenizer: {
      root: [
        [/"[^"]*"/, 'string'],
        [/[0-9]+/, 'number'],
        [/\b(true|false|null)\b/, 'keyword'],
        [/[{}\[\],]/, 'delimiter'],
        [/[a-zA-Z_]\w*/, 'identifier'],
      ]
    }
  });
};

/**
 * High-performance code editor component using Monaco editor
 * Implements Material Design 3.0 theming and accessibility features
 */
const CodeEditor: React.FC<CodeEditorProps> = React.memo(({
  value,
  language,
  onChange,
  readOnly = false,
  height = '100%',
  className = '',
  theme: customTheme,
  options = {},
  onValidation
}) => {
  // Get theme context
  const { isDarkMode } = useTheme();

  // Memoize editor theme
  const editorTheme = useMemo(() => 
    customTheme || (isDarkMode ? 'material-dark' : 'material-light'),
    [customTheme, isDarkMode]
  );

  // Memoize editor options
  const editorOptions = useMemo((): MonacoOptions => ({
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    roundedSelection: true,
    selectOnLineNumbers: true,
    readOnly,
    wordWrap: 'on',
    folding: true,
    dragAndDrop: true,
    formatOnPaste: true,
    formatOnType: true,
    suggestOnTriggerCharacters: true,
    accessibilitySupport: 'on',
    tabSize: 2,
    ...options
  }), [readOnly, options]);

  // Handle editor mounting
  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    // Configure Monaco features
    configureMonaco(monaco);

    // Set up validation if callback provided
    if (onValidation) {
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, 'owner', []);
        editor.onDidChangeModelContent(() => {
          const markers = monaco.editor.getModelMarkers({ owner: 'owner' });
          onValidation(markers);
        });
      }
    }

    // Configure accessibility features
    editor.updateOptions({
      ariaLabel: 'Code editor',
      accessibilityPageSize: 10,
      accessibilitySupport: 'on'
    });
  }, [onValidation]);

  // Handle content changes with debouncing
  const handleEditorChange: OnChange = useCallback((value: string | undefined) => {
    if (value !== undefined && !readOnly) {
      onChange(value);
    }
  }, [onChange, readOnly]);

  // Update editor on theme changes
  useEffect(() => {
    loader.init().then(monaco => {
      monaco.editor.setTheme(editorTheme);
    });
  }, [editorTheme]);

  return (
    <div 
      className={`editor-container ${className}`}
      role="region"
      aria-label="Code editor region"
    >
      <div className="editor-content">
        <Editor
          height={height}
          defaultLanguage={language}
          language={language}
          value={value}
          theme={editorTheme}
          options={editorOptions}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          loading={<div className="editor-loading">Loading editor...</div>}
        />
      </div>
    </div>
  );
});

// Display name for debugging
CodeEditor.displayName = 'CodeEditor';

// Export component
export default CodeEditor;

// Export types for external usage
export type { CodeEditorProps, MonacoOptions };