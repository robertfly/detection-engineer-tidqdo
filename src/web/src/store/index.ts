/**
 * @fileoverview Redux store configuration with enhanced capabilities
 * @version 1.0.0
 * @package @detection-platform/web
 */

// External imports
import { 
  configureStore, 
  getDefaultMiddleware,
  Middleware,
  isPlain,
  EnhancedStore
} from '@reduxjs/toolkit'; // v1.9.0+
import thunk from 'redux-thunk'; // v2.4.0+

// Internal imports
import rootReducer from './rootReducer';
import { RootState } from './rootReducer';

/**
 * Custom middleware for performance monitoring
 * Tracks state update times and logs warnings for slow updates
 */
const performanceMiddleware: Middleware = () => next => action => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;

  // Log warning if state update takes longer than 16ms (targeting 60fps)
  if (duration > 16) {
    console.warn('Slow state update detected:', {
      action: action.type,
      duration: `${duration.toFixed(2)}ms`,
      timestamp: new Date().toISOString()
    });
  }

  return result;
};

/**
 * Custom middleware for error tracking
 * Catches and logs errors during state updates
 */
const errorTrackingMiddleware: Middleware = () => next => action => {
  try {
    return next(action);
  } catch (error) {
    // Log error with context for debugging
    console.error('Redux state update error:', {
      action: action.type,
      error,
      timestamp: new Date().toISOString()
    });

    // Re-throw error to maintain error boundary functionality
    throw error;
  }
};

/**
 * Custom serialization check function for Redux DevTools
 * Allows Date objects and maintains type safety
 */
const isSerializable = (value: unknown): boolean => {
  if (value instanceof Date) return true;
  if (value instanceof Error) return true;
  return isPlain(value);
};

/**
 * Configure and create the Redux store with enhanced capabilities
 * Implements middleware, dev tools, and performance monitoring
 */
const configureAppStore = (): EnhancedStore => {
  const middleware = [
    ...getDefaultMiddleware({
      // Configure middleware options
      thunk: true,
      immutableCheck: true,
      serializableCheck: {
        isSerializable,
        // Ignore certain paths for serialization checks
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        ignoredPaths: ['error.timestamp', 'entities.dates']
      }
    }),
    performanceMiddleware,
    errorTrackingMiddleware
  ];

  // Configure store with all enhancers
  const store = configureStore({
    reducer: rootReducer,
    middleware,
    devTools: process.env.NODE_ENV !== 'production' && {
      // Configure Redux DevTools options
      name: 'AI Detection Platform',
      trace: true,
      traceLimit: 25,
      maxAge: 50
    },
    preloadedState: undefined,
    enhancers: []
  });

  // Enable hot module replacement for reducers in development
  if (process.env.NODE_ENV !== 'production' && module.hot) {
    module.hot.accept('./rootReducer', () => {
      store.replaceReducer(rootReducer);
    });
  }

  return store;
};

// Create store instance
export const store = configureAppStore();

// Export type definitions for TypeScript support
export type AppDispatch = typeof store.dispatch;
export type { RootState };

// Export store instance as default
export default store;