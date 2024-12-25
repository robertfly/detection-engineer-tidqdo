// vite.config.ts
// @vitejs/plugin-react v4.2.0
// vite v4.4.5

import { defineConfig } from 'vite'; // ^4.4.5
import react from '@vitejs/plugin-react'; // ^4.2.0
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      // Enable Fast Refresh for rapid development
      fastRefresh: true,
      // Use automatic JSX runtime
      jsxRuntime: 'automatic',
      // Babel configuration for enhanced features
      babel: {
        plugins: [
          '@babel/plugin-transform-runtime'
        ],
        presets: [
          '@babel/preset-env'
        ]
      }
    })
  ],

  // Development server configuration
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    // CORS enabled for development
    cors: true,
    // Proxy configuration for API and WebSocket endpoints
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: {
          'Connection': 'keep-alive'
        }
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ws/, '')
      }
    },
    // Hot Module Replacement configuration
    hmr: {
      overlay: true
    }
  },

  // Build configuration
  build: {
    outDir: 'dist',
    // Enable source maps for debugging
    sourcemap: true,
    // Use esbuild for faster builds
    minify: 'esbuild',
    // Target modern browsers
    target: 'esnext',
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Rollup-specific options
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: {
          // Core React bundle
          vendor: ['react', 'react-dom'],
          // State management and data fetching
          framework: ['@reduxjs/toolkit', 'react-query'],
          // Code editor bundle
          editor: ['monaco-editor']
        }
      }
    },
    // Split CSS for better caching
    cssCodeSplit: true,
    // Inline small assets
    assetsInlineLimit: 4096
  },

  // Module resolution configuration
  resolve: {
    alias: {
      // Path aliases matching tsconfig.json
      '@': path.resolve(__dirname, 'src')
    },
    // Supported file extensions
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },

  // Dependency optimization
  optimizeDeps: {
    // Pre-bundle these dependencies
    include: [
      'react',
      'react-dom',
      '@reduxjs/toolkit',
      'socket.io-client',
      'monaco-editor',
      'axios',
      'react-query'
    ],
    // Exclude these from pre-bundling
    exclude: ['@babel/runtime']
  },

  // ESBuild configuration
  esbuild: {
    // Automatically inject React import
    jsxInject: "import React from 'react'",
    // Target modern JavaScript
    target: 'esnext'
  },

  // Environment variable handling
  envPrefix: 'VITE_',
  
  // Performance optimizations
  define: {
    __DEV__: process.env.NODE_ENV !== 'production'
  }
});