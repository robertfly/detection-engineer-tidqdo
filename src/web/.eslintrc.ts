// ESLint configuration for AI-Driven Detection Engineering platform frontend
// Version: 1.0.0

// External dependencies:
// @typescript-eslint/eslint-plugin@^6.0.0
// @typescript-eslint/parser@^6.0.0
// eslint-plugin-react@^7.33.0
// eslint-plugin-react-hooks@^4.6.0
// eslint-config-prettier@^9.0.0

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },

  plugins: [
    '@typescript-eslint',
    'react',
    'react-hooks',
  ],

  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier', // Must be last to override other configs
  ],

  settings: {
    react: {
      version: 'detect',
    },
  },

  rules: {
    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',

    // React specific rules
    'react/jsx-boolean-value': ['error', 'never'],
    'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
    'react/jsx-fragments': ['error', 'syntax'],
    'react/jsx-no-useless-fragment': 'error',
    'react/jsx-pascal-case': 'error',
    'react/no-array-index-key': 'error',
    'react/no-danger': 'error',
    'react/no-multi-comp': ['error', { ignoreStateless: true }],
    'react/self-closing-comp': 'error',

    // React Hooks rules
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',

    // General best practices
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-param-reassign': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    'complexity': ['error', { max: 10 }],

    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'react/jsx-no-script-url': 'error',
    'react/no-danger-with-children': 'error',
  },

  overrides: [
    // Test file specific rules
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'max-lines': 'off',
      },
    },
    // Component files
    {
      files: ['**/components/**/*.tsx'],
      rules: {
        'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
  ],

  env: {
    browser: true,
    es2022: true,
    node: true,
  },
};