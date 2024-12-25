/**
 * Redux action creators and thunks for authentication state management.
 * Implements secure authentication flows with JWT tokens, MFA support,
 * session monitoring, and rate limiting.
 * @version 1.0.0
 */

import { createAction } from '@reduxjs/toolkit'; // v1.9.0+
import { ThunkAction } from 'redux-thunk'; // v2.4.0+
import { exponentialBackoff } from 'retry-ts'; // v0.1.0+

import { 
  AuthActionTypes,
  LoginRequestPayload,
  LoginSuccessPayload,
  LoginFailurePayload,
  MFAVerifyPayload,
  RefreshTokenPayload,
  AuthState
} from './types';

import {
  LoginCredentials,
  AuthResponse,
  OAuthProvider,
  User
} from '../../types/auth';

import { RootState } from '../rootReducer';
import { AppThunk } from '../store';

// Rate limiting configuration
const RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  initialDelay: 1000, // 1 second
  maxDelay: 60 * 1000 // 1 minute
};

// Session monitoring configuration
const SESSION_CONFIG = {
  refreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
  activityTimeout: 30 * 60 * 1000, // 30 minutes
  pollInterval: 60 * 1000 // 1 minute
};

/**
 * Action creator for login request
 */
export const loginRequest = createAction<LoginRequestPayload>(
  AuthActionTypes.LOGIN_REQUEST,
  (credentials: LoginCredentials) => ({
    payload: {
      credentials,
      timestamp: Date.now()
    }
  })
);

/**
 * Action creator for login success
 */
export const loginSuccess = createAction<LoginSuccessPayload>(
  AuthActionTypes.LOGIN_SUCCESS
);

/**
 * Action creator for login failure
 */
export const loginFailure = createAction<LoginFailurePayload>(
  AuthActionTypes.LOGIN_FAILURE
);

/**
 * Action creator for MFA requirement
 */
export const mfaRequired = createAction<{ mfaToken: string }>(
  AuthActionTypes.MFA_REQUIRED
);

/**
 * Action creator for session expiry
 */
export const sessionExpired = createAction(AuthActionTypes.SESSION_EXPIRED);

/**
 * Action creator for rate limit exceeded
 */
export const rateLimitExceeded = createAction(
  AuthActionTypes.RATE_LIMIT_EXCEEDED,
  (retryAfter: number) => ({
    payload: { retryAfter }
  })
);

/**
 * Session monitoring utility
 */
export const sessionMonitor = {
  intervalId: null as NodeJS.Timeout | null,

  startMonitoring: (dispatch: AppDispatch, getState: () => RootState) => {
    if (sessionMonitor.intervalId) return;

    sessionMonitor.intervalId = setInterval(() => {
      const state = getState();
      const { sessionExpiry, lastActivity } = state.auth;

      if (!sessionExpiry || !lastActivity) return;

      const now = Date.now();
      const expiryTime = new Date(sessionExpiry).getTime();
      const inactiveTime = now - new Date(lastActivity).getTime();

      // Check for session expiry
      if (now >= expiryTime) {
        dispatch(sessionExpired());
        sessionMonitor.stopMonitoring();
        return;
      }

      // Check for inactivity timeout
      if (inactiveTime >= SESSION_CONFIG.activityTimeout) {
        dispatch(sessionExpired());
        sessionMonitor.stopMonitoring();
        return;
      }

      // Refresh token if approaching expiry
      if (expiryTime - now <= SESSION_CONFIG.refreshThreshold) {
        dispatch(refreshTokenThunk());
      }
    }, SESSION_CONFIG.pollInterval);
  },

  stopMonitoring: () => {
    if (sessionMonitor.intervalId) {
      clearInterval(sessionMonitor.intervalId);
      sessionMonitor.intervalId = null;
    }
  }
};

/**
 * Enhanced login thunk with rate limiting and comprehensive error handling
 */
export const loginThunk = (
  credentials: LoginCredentials
): AppThunk => async (dispatch, getState) => {
  try {
    const state = getState();
    const { loginAttempts = 0, lastLoginAttempt = 0 } = state.auth;

    // Rate limiting check
    if (loginAttempts >= RATE_LIMIT.maxAttempts) {
      const timeElapsed = Date.now() - lastLoginAttempt;
      if (timeElapsed < RATE_LIMIT.windowMs) {
        const retryAfter = exponentialBackoff({
          initialDelay: RATE_LIMIT.initialDelay,
          maxDelay: RATE_LIMIT.maxDelay,
          factor: 2,
          attempts: loginAttempts
        });
        dispatch(rateLimitExceeded(retryAfter));
        throw new Error('Rate limit exceeded');
      }
    }

    dispatch(loginRequest({ credentials }));

    // Determine authentication method and call appropriate service
    const authResponse: AuthResponse = credentials.mfaCode
      ? await authService.verifyMFA(credentials)
      : await authService.login(credentials);

    // Handle MFA requirement
    if (authResponse.mfaRequired) {
      dispatch(mfaRequired({ mfaToken: authResponse.mfaToken! }));
      return;
    }

    // Store tokens securely
    await secureStorage.setTokens({
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken
    });

    // Initialize session monitoring
    dispatch(loginSuccess({ authResponse }));
    sessionMonitor.startMonitoring(dispatch, getState);

  } catch (error) {
    const errorPayload: LoginFailurePayload = {
      error: error.message,
      errorCode: error.code || 'AUTH_ERROR'
    };
    dispatch(loginFailure(errorPayload));
    throw error;
  }
};

/**
 * Token refresh thunk
 */
export const refreshTokenThunk = (): AppThunk => async (dispatch, getState) => {
  try {
    const state = getState();
    const { refreshToken } = state.auth;

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const authResponse = await authService.refreshToken(refreshToken);
    
    await secureStorage.setTokens({
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken
    });

    dispatch(loginSuccess({ authResponse }));
  } catch (error) {
    dispatch(sessionExpired());
    sessionMonitor.stopMonitoring();
    throw error;
  }
};

/**
 * Logout thunk
 */
export const logoutThunk = (): AppThunk => async (dispatch) => {
  try {
    await authService.logout();
    await secureStorage.clearTokens();
    sessionMonitor.stopMonitoring();
    dispatch({ type: AuthActionTypes.LOGOUT });
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear local state even if server logout fails
    await secureStorage.clearTokens();
    sessionMonitor.stopMonitoring();
    dispatch({ type: AuthActionTypes.LOGOUT });
  }
};

// Types
type AppDispatch = typeof store.dispatch;