/**
 * Redux store type definitions for authentication state management.
 * Implements comprehensive type support for authentication flows, MFA,
 * session management and role-based access control.
 * @version 1.0.0
 */

import { PayloadAction } from '@reduxjs/toolkit'; // v1.9.0+
import { User, LoginCredentials, AuthResponse } from '../../types/auth';

/**
 * Comprehensive enum of authentication action types supporting
 * complete authentication flows including MFA and session management.
 */
export enum AuthActionTypes {
  // Login flow
  LOGIN_REQUEST = 'auth/loginRequest',
  LOGIN_SUCCESS = 'auth/loginSuccess',
  LOGIN_FAILURE = 'auth/loginFailure',
  
  // MFA flow
  MFA_REQUIRED = 'auth/mfaRequired',
  MFA_VERIFY = 'auth/mfaVerify',
  
  // Session management
  REFRESH_TOKEN = 'auth/refreshToken',
  SESSION_EXPIRED = 'auth/sessionExpired',
  LOGOUT = 'auth/logout',
  
  // User management
  UPDATE_USER = 'auth/updateUser'
}

/**
 * Authentication state interface with comprehensive support for
 * session management, MFA flows, and error handling.
 */
export interface AuthState {
  // User data and tokens
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  
  // MFA state
  mfaRequired: boolean;
  mfaToken: string | null;
  
  // Session management
  sessionExpiry: number | null;  // Unix timestamp
  lastActivity: Date | null;
  
  // UI state
  loading: boolean;
  error: string | null;
  
  // Authentication context
  authProvider: 'password' | 'oauth' | null;
}

/**
 * Login request action payload interface supporting
 * multiple authentication methods.
 */
export interface LoginRequestPayload {
  credentials: LoginCredentials;
}

/**
 * Login success action payload interface containing
 * authentication response data.
 */
export interface LoginSuccessPayload {
  authResponse: AuthResponse;
}

/**
 * Enhanced login failure action payload interface with
 * detailed error information.
 */
export interface LoginFailurePayload {
  error: string;
  errorCode: string;  // Maps to error code ranges in technical spec
}

/**
 * MFA verification action payload interface for
 * two-factor authentication flow.
 */
export interface MFAVerifyPayload {
  mfaCode: string;
  mfaToken: string;
}

/**
 * Token refresh action payload interface for
 * session management.
 */
export interface RefreshTokenPayload {
  refreshToken: string;
}

/**
 * User data update action payload interface supporting
 * partial updates.
 */
export interface UpdateUserPayload {
  user: Partial<User>;
}

/**
 * Type definitions for typed Redux actions using PayloadAction
 */
export type LoginRequestAction = PayloadAction<LoginRequestPayload>;
export type LoginSuccessAction = PayloadAction<LoginSuccessPayload>;
export type LoginFailureAction = PayloadAction<LoginFailurePayload>;
export type MFAVerifyAction = PayloadAction<MFAVerifyPayload>;
export type RefreshTokenAction = PayloadAction<RefreshTokenPayload>;
export type UpdateUserAction = PayloadAction<UpdateUserPayload>;