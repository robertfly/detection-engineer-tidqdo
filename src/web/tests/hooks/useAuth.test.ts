/**
 * Comprehensive test suite for useAuth custom hook
 * Tests authentication flows, security monitoring, session management, and RBAC
 * @version 1.0.0
 */

import { renderHook, act, waitFor } from '@testing-library/react'; // v14.0.0+
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0+
import mockAxios from 'jest-mock-axios'; // v4.7.2

// Internal imports
import { useAuth } from '../../src/hooks/useAuth';
import { AuthProvider, SecurityEventEmitter } from '../../src/contexts/AuthContext';
import { User, UserRole, LoginCredentials, AuthResponse, SecurityEvent } from '../../src/types/auth';
import { ERROR_CODES } from '../../src/config/constants';

// Test setup types
interface SetupOptions {
  initialUser?: User | null;
  mfaRequired?: boolean;
  securityEvents?: SecurityEvent[];
}

// Mock user data
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
  lastLogin: new Date('2024-01-19T00:00:00.000Z'),
  mfaEnabled: true
};

// Mock credentials
const mockLoginCredentials: LoginCredentials = {
  email: 'test@example.com',
  password: 'password123',
  mfaCode: '123456',
  rememberMe: true
};

// Mock auth response
const mockAuthResponse: AuthResponse = {
  user: mockUser,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  mfaRequired: false,
  expiresIn: 3600
};

/**
 * Helper function to setup test environment
 */
const setupTest = (options: SetupOptions = {}) => {
  const securityEventEmitter = new SecurityEventEmitter();
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider
      initialUser={options.initialUser}
      mfaRequired={options.mfaRequired}
      securityEvents={options.securityEvents}
      securityEventEmitter={securityEventEmitter}
    >
      {children}
    </AuthProvider>
  );

  const { result } = renderHook(() => useAuth(), { wrapper });
  return { result, securityEventEmitter };
};

/**
 * Helper function to generate mock security events
 */
const mockSecurityEvent = (type: string): SecurityEvent => ({
  type,
  timestamp: new Date(),
  details: {
    userId: mockUser.id,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0'
  }
});

describe('useAuth hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('initialization', () => {
    it('should throw error when used outside AuthProvider', () => {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');
    });

    it('should initialize with null user and not authenticated', () => {
      const { result } = setupTest();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBeFalsy();
    });

    it('should setup security event listeners', () => {
      const { result, securityEventEmitter } = setupTest();
      const event = mockSecurityEvent('AUTH_INIT');
      
      act(() => {
        securityEventEmitter.emit('securityEvent', event);
      });

      expect(result.current.securityEvents).toContainEqual(
        expect.objectContaining({ type: 'AUTH_INIT' })
      );
    });

    it('should initialize token refresh mechanism', async () => {
      const { result } = setupTest({
        initialUser: mockUser
      });

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.any(Object)
      );
    });
  });

  describe('login functionality', () => {
    it('should successfully login user', async () => {
      const { result } = setupTest();
      mockAxios.post.mockResolvedValueOnce({ data: mockAuthResponse });

      await act(async () => {
        await result.current.login(mockLoginCredentials);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBeTruthy();
    });

    it('should handle MFA requirement during login', async () => {
      const { result } = setupTest({
        mfaRequired: true
      });

      const mfaResponse = { ...mockAuthResponse, mfaRequired: true };
      mockAxios.post.mockResolvedValueOnce({ data: mfaResponse });

      await act(async () => {
        await result.current.login(mockLoginCredentials);
      });

      expect(result.current.requiresMFA).toBeTruthy();
    });

    it('should handle login errors', async () => {
      const { result } = setupTest();
      const error = { code: ERROR_CODES.AUTH.INVALID_CREDENTIALS };
      mockAxios.post.mockRejectedValueOnce(error);

      await act(async () => {
        await expect(result.current.login(mockLoginCredentials))
          .rejects.toEqual(error);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBeFalsy();
    });

    it('should track failed login attempts', async () => {
      const { result, securityEventEmitter } = setupTest();
      const error = { code: ERROR_CODES.AUTH.INVALID_CREDENTIALS };
      mockAxios.post.mockRejectedValueOnce(error);

      await act(async () => {
        try {
          await result.current.login(mockLoginCredentials);
        } catch {}
      });

      expect(result.current.securityEvents).toContainEqual(
        expect.objectContaining({ type: 'error' })
      );
    });
  });

  describe('session management', () => {
    it('should handle token refresh', async () => {
      const { result } = setupTest({
        initialUser: mockUser
      });

      mockAxios.post.mockResolvedValueOnce({
        data: { accessToken: 'new-token', refreshToken: 'new-refresh' }
      });

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.any(Object)
      );
    });

    it('should validate session integrity', async () => {
      const { result } = setupTest({
        initialUser: mockUser
      });

      mockAxios.get.mockResolvedValueOnce({ data: { valid: true } });

      await act(async () => {
        await result.current.validateSession();
      });

      expect(mockAxios.get).toHaveBeenCalledWith('/auth/validate');
    });

    it('should handle session timeout', async () => {
      const { result } = setupTest({
        initialUser: mockUser
      });

      mockAxios.get.mockRejectedValueOnce({
        code: ERROR_CODES.AUTH.SESSION_EXPIRED
      });

      await act(async () => {
        await result.current.validateSession();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBeFalsy();
    });
  });

  describe('security monitoring', () => {
    it('should track security events', async () => {
      const { result, securityEventEmitter } = setupTest();
      const event = mockSecurityEvent('AUTH_SUCCESS');

      act(() => {
        securityEventEmitter.emit('securityEvent', event);
      });

      expect(result.current.securityEvents).toContainEqual(
        expect.objectContaining({ type: 'AUTH_SUCCESS' })
      );
    });

    it('should handle rate limit violations', async () => {
      const { result } = setupTest();
      const error = { code: ERROR_CODES.API.RATE_LIMIT_EXCEEDED };
      mockAxios.post.mockRejectedValueOnce(error);

      await act(async () => {
        try {
          await result.current.login(mockLoginCredentials);
        } catch {}
      });

      expect(result.current.securityEvents).toContainEqual(
        expect.objectContaining({ type: 'error' })
      );
    });

    it('should monitor suspicious activities', async () => {
      const { result, securityEventEmitter } = setupTest({
        initialUser: mockUser
      });

      const suspiciousEvent = mockSecurityEvent('SUSPICIOUS_ACTIVITY');
      act(() => {
        securityEventEmitter.emit('securityEvent', suspiciousEvent);
      });

      expect(result.current.securityEvents).toContainEqual(
        expect.objectContaining({ type: 'SUSPICIOUS_ACTIVITY' })
      );
    });
  });
});