/**
 * Test suite for authentication reducer validating secure state management,
 * authentication flows, session handling, and MFA operations.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals'; // v29.0.0+
import { authReducer } from '../../../src/store/auth/reducer';
import {
  AuthState,
  AuthActionTypes,
  LoginSuccessPayload,
  LoginFailurePayload,
  MFAVerifyPayload,
  RefreshTokenPayload,
  SessionExpiredPayload,
  OAuthLoginPayload
} from '../../../src/store/auth/types';
import {
  User,
  UserRole,
  OAuthProvider,
  AuthErrorCode
} from '../../../src/types/auth';

// Mock test data
const mockUser: User = {
  id: 'test-id',
  email: 'test@example.com',
  name: 'Test User',
  role: UserRole.ENTERPRISE_USER,
  preferences: {
    theme: 'light',
    notifications: true,
    language: 'en',
    timezone: 'UTC'
  },
  lastLogin: new Date(),
  mfaEnabled: false
};

const mockOAuthUser: User = {
  id: 'oauth-id',
  email: 'oauth@example.com',
  name: 'OAuth User',
  role: UserRole.COMMUNITY_USER,
  preferences: {
    theme: 'dark',
    notifications: true,
    language: 'en',
    timezone: 'UTC'
  },
  lastLogin: new Date(),
  mfaEnabled: true
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  loading: false,
  error: null,
  mfaRequired: false,
  mfaToken: null,
  sessionExpiry: null,
  lastActivity: null,
  authProvider: null
};

describe('authReducer', () => {
  let state: AuthState;

  beforeEach(() => {
    state = { ...initialState };
  });

  describe('Initial State', () => {
    it('should return the initial state', () => {
      const resultState = authReducer(undefined, { type: '@@INIT' });
      expect(resultState).toEqual(initialState);
    });

    it('should have secure default values', () => {
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.mfaToken).toBeNull();
      expect(state.user).toBeNull();
    });
  });

  describe('Login Flow', () => {
    it('should handle LOGIN_REQUEST', () => {
      const resultState = authReducer(state, {
        type: AuthActionTypes.LOGIN_REQUEST
      });

      expect(resultState.loading).toBe(true);
      expect(resultState.error).toBeNull();
      expect(resultState.mfaRequired).toBe(false);
      expect(resultState.mfaToken).toBeNull();
    });

    it('should handle LOGIN_SUCCESS with password auth', () => {
      const payload: LoginSuccessPayload = {
        authResponse: {
          user: mockUser,
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          mfaRequired: false,
          expiresIn: 3600
        }
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload
      });

      expect(resultState.user).toEqual(mockUser);
      expect(resultState.accessToken).toBe('test-access-token');
      expect(resultState.refreshToken).toBe('test-refresh-token');
      expect(resultState.loading).toBe(false);
      expect(resultState.error).toBeNull();
      expect(resultState.authProvider).toBe('password');
      expect(resultState.sessionExpiry).toBeDefined();
      expect(resultState.lastActivity).toBeDefined();
    });

    it('should handle LOGIN_FAILURE', () => {
      const payload: LoginFailurePayload = {
        error: 'Invalid credentials',
        errorCode: AuthErrorCode.INVALID_CREDENTIALS
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.LOGIN_FAILURE,
        payload
      });

      expect(resultState.loading).toBe(false);
      expect(resultState.error).toBe(payload.error);
      expect(resultState.user).toBeNull();
      expect(resultState.accessToken).toBeNull();
      expect(resultState.refreshToken).toBeNull();
      expect(resultState.authProvider).toBeNull();
    });

    it('should handle OAuth login success', () => {
      const payload: LoginSuccessPayload = {
        authResponse: {
          user: mockOAuthUser,
          accessToken: 'oauth-access-token',
          refreshToken: 'oauth-refresh-token',
          mfaRequired: false,
          expiresIn: 3600
        }
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.LOGIN_SUCCESS,
        payload
      });

      expect(resultState.user).toEqual(mockOAuthUser);
      expect(resultState.accessToken).toBe('oauth-access-token');
      expect(resultState.authProvider).toBe('password');
      expect(resultState.sessionExpiry).toBeDefined();
    });
  });

  describe('MFA Flow', () => {
    it('should handle MFA_REQUIRED', () => {
      const resultState = authReducer(state, {
        type: AuthActionTypes.MFA_REQUIRED,
        payload: { mfaToken: 'mfa-token' }
      });

      expect(resultState.mfaRequired).toBe(true);
      expect(resultState.mfaToken).toBe('mfa-token');
      expect(resultState.loading).toBe(false);
    });

    it('should handle MFA_VERIFY', () => {
      const payload: MFAVerifyPayload = {
        mfaCode: '123456',
        mfaToken: 'mfa-token'
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.MFA_VERIFY,
        payload
      });

      expect(resultState.loading).toBe(true);
      expect(resultState.error).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should handle REFRESH_TOKEN', () => {
      const payload: RefreshTokenPayload = {
        refreshToken: 'new-access-token'
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.REFRESH_TOKEN,
        payload
      });

      expect(resultState.accessToken).toBe('new-access-token');
      expect(resultState.sessionExpiry).toBeDefined();
      expect(resultState.lastActivity).toBeDefined();
    });

    it('should handle SESSION_EXPIRED', () => {
      const resultState = authReducer(state, {
        type: AuthActionTypes.SESSION_EXPIRED
      });

      expect(resultState.accessToken).toBeNull();
      expect(resultState.refreshToken).toBeNull();
      expect(resultState.sessionExpiry).toBeNull();
      expect(resultState.lastActivity).toBeNull();
      expect(resultState.error).toBe('Session expired. Please login again.');
    });

    it('should handle LOGOUT', () => {
      // First set some state
      state = {
        ...state,
        user: mockUser,
        accessToken: 'test-token',
        refreshToken: 'refresh-token'
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.LOGOUT
      });

      expect(resultState).toEqual(initialState);
    });

    it('should handle UPDATE_USER', () => {
      // First set a user
      state = {
        ...state,
        user: mockUser
      };

      const updatePayload = {
        user: {
          name: 'Updated Name',
          preferences: {
            ...mockUser.preferences,
            theme: 'dark'
          }
        }
      };

      const resultState = authReducer(state, {
        type: AuthActionTypes.UPDATE_USER,
        payload: updatePayload
      });

      expect(resultState.user?.name).toBe('Updated Name');
      expect(resultState.user?.preferences.theme).toBe('dark');
      expect(resultState.lastActivity).toBeDefined();
    });
  });
});