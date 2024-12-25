/**
 * @fileoverview Redux selectors for authentication state management
 * @version 1.0.0
 * Implements secure, memoized selectors with comprehensive error handling and MFA support
 */

// External imports
import { createSelector } from '@reduxjs/toolkit'; // v1.9.0+

// Internal imports
import { RootState } from '../rootReducer';
import { AuthState } from './types';

/**
 * Base selector to get the auth slice from root state
 * Implements type safety and validation
 */
export const selectAuthState = (state: RootState): AuthState => {
  if (!state.auth) {
    console.error('Auth state slice not found in root state');
    return {
      user: null,
      accessToken: null,
      refreshToken: null,
      mfaRequired: false,
      mfaToken: null,
      sessionExpiry: null,
      lastActivity: null,
      loading: false,
      error: null,
      authProvider: null
    };
  }
  return state.auth;
};

/**
 * Memoized selector for getting the current authenticated user
 * Implements security logging and type safety
 */
export const selectUser = createSelector(
  [selectAuthState],
  (authState): AuthState['user'] => {
    if (authState.user) {
      // Log user access for security audit
      console.debug('User data accessed:', {
        userId: authState.user.id,
        role: authState.user.role,
        timestamp: new Date().toISOString()
      });
    }
    return authState.user;
  }
);

/**
 * Secure selector for getting the current access token with validation
 * Implements token expiry checking and security logging
 */
export const selectAccessToken = createSelector(
  [selectAuthState],
  (authState): string | null => {
    const token = authState.accessToken;
    if (token && authState.sessionExpiry) {
      // Check token expiry
      if (Date.now() >= authState.sessionExpiry) {
        console.warn('Access token expired:', {
          expiry: new Date(authState.sessionExpiry).toISOString(),
          timestamp: new Date().toISOString()
        });
        return null;
      }
      return token;
    }
    return null;
  }
);

/**
 * Complex selector for checking complete authentication status
 * Implements MFA validation and session checks
 */
export const selectIsAuthenticated = createSelector(
  [selectAuthState],
  (authState): boolean => {
    const isBasicAuth = Boolean(authState.user && authState.accessToken);
    const isMfaValid = !authState.mfaRequired || Boolean(authState.mfaToken);
    const isSessionValid = authState.sessionExpiry ? Date.now() < authState.sessionExpiry : false;

    // Log authentication status for security monitoring
    console.debug('Authentication status checked:', {
      isBasicAuth,
      isMfaValid,
      isSessionValid,
      timestamp: new Date().toISOString()
    });

    return isBasicAuth && isMfaValid && isSessionValid;
  }
);

/**
 * Enhanced MFA status selector with verification state
 * Implements comprehensive MFA state tracking
 */
export const selectMfaStatus = createSelector(
  [selectAuthState],
  (authState): { required: boolean; verified: boolean; pending: boolean } => {
    return {
      required: authState.mfaRequired,
      verified: Boolean(authState.mfaToken),
      pending: authState.mfaRequired && !authState.mfaToken
    };
  }
);

/**
 * Selector for authentication loading state
 * Used for UI loading indicators
 */
export const selectAuthLoading = createSelector(
  [selectAuthState],
  (authState): boolean => authState.loading
);

/**
 * Comprehensive error state selector with error categorization
 * Implements detailed error tracking and logging
 */
export const selectAuthError = createSelector(
  [selectAuthState],
  (authState): { code: string | null; message: string | null } => {
    if (authState.error) {
      // Log error for monitoring
      console.error('Auth error accessed:', {
        error: authState.error,
        timestamp: new Date().toISOString()
      });
    }
    return {
      code: authState.error || null,
      message: authState.error || null
    };
  }
);

/**
 * Session status selector with expiry checking
 * Implements session validation and monitoring
 */
export const selectSessionStatus = createSelector(
  [selectAuthState],
  (authState): { active: boolean; expiresAt: number | null; lastActivity: Date | null } => {
    return {
      active: Boolean(authState.sessionExpiry && Date.now() < authState.sessionExpiry),
      expiresAt: authState.sessionExpiry,
      lastActivity: authState.lastActivity ? new Date(authState.lastActivity) : null
    };
  }
);

/**
 * Authentication provider selector
 * Tracks the method used for authentication
 */
export const selectAuthProvider = createSelector(
  [selectAuthState],
  (authState): AuthState['authProvider'] => authState.authProvider
);