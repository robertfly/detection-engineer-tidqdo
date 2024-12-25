/**
 * Authentication service test suite
 * Implements comprehensive testing for secure authentication flows and security controls
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { MockInstance } from 'jest-mock';
import crypto from 'crypto';

// Internal imports
import {
  login,
  register,
  oauthLogin,
  verifyMfa,
  refreshToken,
  logout,
  getCurrentUser,
} from '../../../../src/services/api/auth';
import { post, get } from '../../../../src/utils/api';
import { storage } from '../../../../src/utils/storage';
import { ERROR_CODES } from '../../../../src/config/constants';
import type {
  LoginCredentials,
  AuthResponse,
  OAuthCredentials,
  User,
  OAuthProvider,
  UserRole
} from '../../../../src/types/auth';

// Mock implementations
jest.mock('../../../../src/utils/api');
jest.mock('../../../../src/utils/storage');
jest.mock('crypto');

// Test data
const mockUser: User = {
  id: 'test-user-id',
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
  mfaEnabled: true
};

const mockAuthResponse: AuthResponse = {
  user: mockUser,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  mfaRequired: true,
  mfaToken: 'mock-mfa-token',
  expiresIn: 3600
};

describe('auth service', () => {
  let postMock: MockInstance;
  let getMock: MockInstance;
  let storageMock: MockInstance;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Configure mocks
    postMock = post as jest.MockedFunction<typeof post>;
    getMock = get as jest.MockedFunction<typeof get>;
    storageMock = jest.spyOn(storage, 'setItem');

    // Mock crypto for token validation
    jest.spyOn(crypto, 'randomBytes').mockImplementation(() => Buffer.from('mock-random-bytes'));
  });

  describe('login', () => {
    test('successful login with rate limiting', async () => {
      // Setup
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        rememberMe: true
      };

      postMock.mockResolvedValueOnce({ data: mockAuthResponse });
      storage.getItem = jest.fn().mockResolvedValueOnce(0); // No previous attempts

      // Execute
      const response = await login(credentials);

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/login', credentials);
      expect(storageMock).toHaveBeenCalledWith('access_token', mockAuthResponse.accessToken, true);
      expect(storageMock).toHaveBeenCalledWith('refresh_token', mockAuthResponse.refreshToken, true);
      expect(response).toEqual(mockAuthResponse);
    });

    test('handles login attempt limits', async () => {
      // Setup
      const credentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'WrongPass123!',
        rememberMe: false
      };

      storage.getItem = jest.fn().mockResolvedValueOnce(5); // Max attempts reached
      storage.getItem = jest.fn().mockResolvedValueOnce(Date.now()); // Recent lockout

      // Execute & Verify
      await expect(login(credentials)).rejects.toThrow('Account temporarily locked');
    });

    test('validates credentials format', async () => {
      // Setup
      const invalidCredentials: LoginCredentials = {
        email: '',
        password: '',
        rememberMe: false
      };

      // Execute & Verify
      await expect(login(invalidCredentials)).rejects.toThrow('Invalid credentials format');
    });
  });

  describe('register', () => {
    test('successful registration with password validation', async () => {
      // Setup
      const credentials: LoginCredentials = {
        email: 'new@example.com',
        password: 'SecurePass123!@',
        rememberMe: false
      };

      postMock.mockResolvedValueOnce({ data: mockAuthResponse });

      // Execute
      const response = await register(credentials);

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/register', credentials);
      expect(storageMock).toHaveBeenCalledWith('access_token', mockAuthResponse.accessToken, true);
      expect(response).toEqual(mockAuthResponse);
    });

    test('enforces password strength requirements', async () => {
      // Setup
      const weakCredentials: LoginCredentials = {
        email: 'test@example.com',
        password: 'weak',
        rememberMe: false
      };

      // Execute & Verify
      await expect(register(weakCredentials)).rejects.toThrow('Password does not meet security requirements');
    });
  });

  describe('oauth', () => {
    test('successful OAuth login with state validation', async () => {
      // Setup
      const oauthCredentials: OAuthCredentials = {
        provider: OAuthProvider.GITHUB,
        code: 'mock-auth-code',
        state: 'mock-state',
        scope: 'user:email',
        redirectUri: 'http://localhost:3000/oauth/callback'
      };

      storage.getItem = jest.fn().mockResolvedValueOnce('mock-state'); // Stored state
      postMock.mockResolvedValueOnce({ data: mockAuthResponse });

      // Execute
      const response = await oauthLogin(oauthCredentials);

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/oauth', expect.any(Object));
      expect(storageMock).toHaveBeenCalledWith('access_token', mockAuthResponse.accessToken, true);
      expect(response).toEqual(mockAuthResponse);
    });

    test('prevents CSRF attacks with state validation', async () => {
      // Setup
      const oauthCredentials: OAuthCredentials = {
        provider: OAuthProvider.GITHUB,
        code: 'mock-auth-code',
        state: 'invalid-state',
        scope: 'user:email',
        redirectUri: 'http://localhost:3000/oauth/callback'
      };

      storage.getItem = jest.fn().mockResolvedValueOnce('mock-state'); // Different state

      // Execute & Verify
      await expect(oauthLogin(oauthCredentials)).rejects.toThrow('Invalid OAuth state');
    });
  });

  describe('mfa', () => {
    test('successful MFA verification', async () => {
      // Setup
      const mfaCredentials = {
        mfaToken: 'mock-mfa-token',
        mfaCode: '123456'
      };

      postMock.mockResolvedValueOnce({ data: mockAuthResponse });

      // Execute
      const response = await verifyMfa(mfaCredentials);

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/mfa/verify', mfaCredentials);
      expect(storageMock).toHaveBeenCalledWith('access_token', mockAuthResponse.accessToken, true);
      expect(response).toEqual(mockAuthResponse);
    });

    test('validates MFA code format', async () => {
      // Setup
      const invalidMfaCredentials = {
        mfaToken: 'mock-mfa-token',
        mfaCode: '12345' // Invalid length
      };

      // Execute & Verify
      await expect(verifyMfa(invalidMfaCredentials)).rejects.toThrow('Invalid MFA code format');
    });
  });

  describe('token management', () => {
    test('successful token refresh', async () => {
      // Setup
      const mockTokenResponse = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      };

      postMock.mockResolvedValueOnce({ data: mockTokenResponse });

      // Execute
      const response = await refreshToken('mock-refresh-token');

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'mock-refresh-token' });
      expect(storageMock).toHaveBeenCalledWith('access_token', mockTokenResponse.accessToken, true);
      expect(response).toEqual(mockTokenResponse);
    });

    test('handles token refresh failure', async () => {
      // Setup
      postMock.mockRejectedValueOnce(new Error('Token refresh failed'));

      // Execute & Verify
      await expect(refreshToken('invalid-token')).rejects.toThrow('Token refresh failed');
    });
  });

  describe('session management', () => {
    test('successful logout', async () => {
      // Setup
      postMock.mockResolvedValueOnce({ data: { success: true } });

      // Execute
      await logout();

      // Verify
      expect(postMock).toHaveBeenCalledWith('/auth/logout');
      expect(storage.removeItem).toHaveBeenCalledWith('access_token');
      expect(storage.removeItem).toHaveBeenCalledWith('refresh_token');
    });

    test('gets current user with token validation', async () => {
      // Setup
      storage.getItem = jest.fn().mockResolvedValueOnce('mock-token');
      getMock.mockResolvedValueOnce({ data: mockUser });

      // Execute
      const user = await getCurrentUser();

      // Verify
      expect(getMock).toHaveBeenCalledWith('/auth/me');
      expect(user).toEqual(mockUser);
    });
  });
});