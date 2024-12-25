// prettier v3.0.0
import type { Config } from 'prettier';

/**
 * Prettier configuration for React TypeScript frontend application
 * Enforces consistent code style and formatting across the project
 * Integrates with ESLint and TypeScript compiler settings
 */
const prettierConfig: Config = {
  // Use semicolons at the end of statements
  semi: true,

  // Add trailing commas in objects, arrays, etc.
  trailingComma: 'es5',

  // Use single quotes for strings
  singleQuote: true,

  // Maximum line length before wrapping
  printWidth: 100,

  // Number of spaces per indentation level
  tabWidth: 2,

  // Add spaces between brackets in object literals
  bracketSpacing: true,

  // Include parentheses around single arrow function parameters
  arrowParens: 'always',

  // Use single quotes in JSX
  jsxSingleQuote: true,

  // Place the closing bracket of JSX elements on a new line
  jsxBracketSameLine: false,

  // Specify the parser for TypeScript files
  parser: 'typescript',

  // File-specific overrides
  overrides: [
    {
      // Apply specific rules for TypeScript and TSX files
      files: ['*.ts', '*.tsx'],
      options: {
        parser: 'typescript',
      },
    },
    {
      // Apply specific rules for JavaScript and JSX files
      files: ['*.js', '*.jsx'],
      options: {
        parser: 'babel',
      },
    },
    {
      // Apply specific rules for JSON files
      files: ['*.json', '.prettierrc', '.eslintrc'],
      options: {
        parser: 'json',
        tabWidth: 2,
      },
    },
    {
      // Apply specific rules for CSS and SCSS files
      files: ['*.css', '*.scss'],
      options: {
        parser: 'css',
        singleQuote: false,
      },
    },
    {
      // Apply specific rules for Markdown files
      files: ['*.md'],
      options: {
        parser: 'markdown',
        proseWrap: 'always',
      },
    },
  ],

  // Ensure consistent line endings
  endOfLine: 'lf',

  // HTML specific settings
  htmlWhitespaceSensitivity: 'css',

  // Maintain consistent quote style in objects
  quoteProps: 'as-needed',

  // Add empty line at the end of files
  insertPragma: false,
  requirePragma: false,

  // Preserve markdown text wrapping
  proseWrap: 'preserve',

  // Enforce consistent newlines between elements
  bracketSameLine: false,

  // Enforce spaces in embedded languages
  embeddedLanguageFormatting: 'auto',
};

export default prettierConfig;