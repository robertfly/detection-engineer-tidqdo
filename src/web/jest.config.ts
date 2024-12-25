import type { Config } from '@jest/types'; // v29.6.0

/*
 * Jest Configuration for AI-Driven Detection Engineering Platform Frontend
 * Configures comprehensive test environment settings for React/TypeScript frontend
 * including module resolution, coverage reporting, and test execution parameters
 */
const config: Config.InitialOptions = {
  // Use jsdom environment for DOM testing
  testEnvironment: 'jsdom',

  // Setup files to run after Jest is initialized
  setupFilesAfterEnv: [
    '@testing-library/jest-dom',
    '<rootDir>/src/setupTests.ts'
  ],

  // Module name mapping for path aliases and static assets
  moduleNameMapper: {
    // Path alias mapping
    '^@/(.*)$': '<rootDir>/src/$1',
    // Style file mocks
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Static asset mocks
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js'
  },

  // TypeScript transformation configuration
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Test file patterns
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

  // File extensions to consider for testing
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],

  // Enable coverage collection
  collectCoverage: true,

  // Files to collect coverage from
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/vite-env.d.ts',
    '!src/main.tsx',
    '!src/App.tsx',
    '!src/setupTests.ts'
  ],

  // Coverage thresholds enforcement
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test result reporters
  reporters: [
    'default',
    'jest-junit'
  ]
};

export default config;