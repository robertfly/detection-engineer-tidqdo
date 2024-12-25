/**
 * Redux reducer for authentication state management.
 * Implements comprehensive authentication flows including MFA,
 * session management, and multi-provider support with error handling.
 * @version 1.0.0
 */

import { createReducer, PayloadAction } from '@reduxjs/toolkit'; // v1.9.0+
import {
  AuthState,
  AuthActionTypes,
  LoginRequestAction,
  LoginSuccessAction,
  LoginFailureAction,
  MFAVerifyAction,
  RefreshTokenAction,
  UpdateUserAction
} from './types';

/**
 * Initial authentication state implementing complete session management
 * and MFA support as per security specifications.
 */
const initialState: AuthState = {
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

/**
 * Enhanced Redux reducer for authentication state management.
 * Implements comprehensive authentication flows with MFA support,
 * session management, and detailed error handling.
 */
export const authReducer = createReducer(initialState, (builder) => {
  builder
    // Login Request Handler
    .addCase(AuthActionTypes.LOGIN_REQUEST, (state) => {
      state.loading = true;
      state.error = null;
      state.mfaRequired = false;
      state.mfaToken = null;
    })

    // Login Success Handler
    .addCase(AuthActionTypes.LOGIN_SUCCESS, (state, action: LoginSuccessAction) => {
      const { user, accessToken, refreshToken, mfaRequired, mfaToken, expiresIn } = action.payload.authResponse;
      
      state.loading = false;
      state.user = user;
      state.accessToken = accessToken;
      state.refreshToken = refreshToken;
      state.mfaRequired = mfaRequired;
      state.mfaToken = mfaToken || null;
      state.sessionExpiry = Date.now() + (expiresIn * 1000);
      state.lastActivity = new Date();
      state.error = null;
      state.authProvider = 'password'; // Set based on login method
    })

    // Login Failure Handler
    .addCase(AuthActionTypes.LOGIN_FAILURE, (state, action: LoginFailureAction) => {
      state.loading = false;
      state.error = action.payload.error;
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.mfaRequired = false;
      state.mfaToken = null;
      state.sessionExpiry = null;
      state.lastActivity = null;
      state.authProvider = null;
    })

    // MFA Required Handler
    .addCase(AuthActionTypes.MFA_REQUIRED, (state, action: PayloadAction<{ mfaToken: string }>) => {
      state.mfaRequired = true;
      state.mfaToken = action.payload.mfaToken;
      state.loading = false;
    })

    // MFA Verification Handler
    .addCase(AuthActionTypes.MFA_VERIFY, (state, action: MFAVerifyAction) => {
      state.loading = true;
      state.error = null;
    })

    // Token Refresh Handler
    .addCase(AuthActionTypes.REFRESH_TOKEN, (state, action: RefreshTokenAction) => {
      state.accessToken = action.payload.refreshToken;
      state.sessionExpiry = Date.now() + (3600 * 1000); // 1 hour default
      state.lastActivity = new Date();
    })

    // Session Expired Handler
    .addCase(AuthActionTypes.SESSION_EXPIRED, (state) => {
      state.accessToken = null;
      state.refreshToken = null;
      state.sessionExpiry = null;
      state.lastActivity = null;
      state.error = 'Session expired. Please login again.';
      state.mfaRequired = false;
      state.mfaToken = null;
    })

    // Logout Handler
    .addCase(AuthActionTypes.LOGOUT, (state) => {
      // Reset to initial state on logout
      Object.assign(state, initialState);
    })

    // User Data Update Handler
    .addCase(AuthActionTypes.UPDATE_USER, (state, action: UpdateUserAction) => {
      if (state.user) {
        state.user = {
          ...state.user,
          ...action.payload.user
        };
        state.lastActivity = new Date();
      }
    });
});

export default authReducer;