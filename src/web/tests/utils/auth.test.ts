/**
 * @fileoverview Comprehensive test suite for authentication utilities
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'; // v29.7.0
import CryptoJS from 'crypto-js'; // v4.2.0
import jwtDecode from 'jwt-decode'; // v4.0.0
import {
  getStoredTokens,
  setStoredTokens,
  clearStoredTokens,
  isValidToken,
  getUserFromToken,
  hasRequiredRole
} from '../../src/utils/auth';
import { UserRole } from '../../src/types/auth';
import { API_ENDPOINTS } from '../../src/config/api';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Test data setup
const mockValidJWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkVOVEVSUFJJU0VfVVNFUiIsInBlcm1pc3Npb25zIjpbInJlYWQ6ZGV0ZWN0aW9ucyIsIndyaXRlOmRldGVjdGlvbnMiXSwiZXhwIjoxNzA1MjQ4MDAwLCJpYXQiOjE3MDUxNjE2MDAsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvdjEvYXV0aC9sb2dpbiIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCJ9';

const mockAuthResponse = {
  accessToken: mockValidJWT,
  refreshToken: 'mock-refresh-token',
  mfaToken: 'mock-mfa-token'
};

describe('Auth Utils', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' }
    });
  });

  afterEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  describe('Token Management', () => {
    it('should securely store encrypted tokens', () => {
      setStoredTokens(mockAuthResponse);
      
      const storedAccessToken = mockLocalStorage.getItem('encrypted_access_token');
      const storedRefreshToken = mockLocalStorage.getItem('encrypted_refresh_token');
      const storedMfaToken = mockLocalStorage.getItem('encrypted_mfa_token');

      expect(storedAccessToken).toBeDefined();
      expect(storedRefreshToken).toBeDefined();
      expect(storedMfaToken).toBeDefined();

      // Verify tokens are encrypted
      expect(storedAccessToken).not.toBe(mockAuthResponse.accessToken);
      expect(storedRefreshToken).not.toBe(mockAuthResponse.refreshToken);
      expect(storedMfaToken).not.toBe(mockAuthResponse.mfaToken);
    });

    it('should retrieve and decrypt stored tokens', () => {
      setStoredTokens(mockAuthResponse);
      const tokens = getStoredTokens();

      expect(tokens.accessToken).toBe(mockAuthResponse.accessToken);
      expect(tokens.refreshToken).toBe(mockAuthResponse.refreshToken);
      expect(tokens.mfaToken).toBe(mockAuthResponse.mfaToken);
    });

    it('should handle invalid encrypted data gracefully', () => {
      mockLocalStorage.setItem('encrypted_access_token', 'invalid-encrypted-data');
      const tokens = getStoredTokens();
      expect(tokens.accessToken).toBeNull();
    });

    it('should clear all stored tokens', () => {
      setStoredTokens(mockAuthResponse);
      clearStoredTokens();

      expect(mockLocalStorage.getItem('encrypted_access_token')).toBeNull();
      expect(mockLocalStorage.getItem('encrypted_refresh_token')).toBeNull();
      expect(mockLocalStorage.getItem('encrypted_mfa_token')).toBeNull();
    });
  });

  describe('Token Validation', () => {
    it('should validate a properly formatted JWT token', () => {
      const isValid = isValidToken(mockValidJWT);
      expect(isValid).toBe(true);
    });

    it('should reject expired tokens', () => {
      const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkVOVEVSUFJJU0VfVVNFUiIsInBlcm1pc3Npb25zIjpbXSwiZXhwIjoxNjAwMDAwMDAwLCJpYXQiOjE1OTk5OTk5OTksImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvdjEvYXV0aC9sb2dpbiIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCJ9';
      expect(isValidToken(expiredToken)).toBe(false);
    });

    it('should reject tokens with invalid issuer', () => {
      const invalidIssuerToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkVOVEVSUFJJU0VfVVNFUiIsInBlcm1pc3Npb25zIjpbXSwiZXhwIjoxNzA1MjQ4MDAwLCJpYXQiOjE3MDUxNjE2MDAsImlzcyI6ImludmFsaWQtaXNzdWVyIiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwIn0';
      expect(isValidToken(invalidIssuerToken)).toBe(false);
    });

    it('should reject malformed tokens', () => {
      expect(isValidToken('invalid-token')).toBe(false);
    });
  });

  describe('User Extraction', () => {
    it('should extract valid user data from token', () => {
      const user = getUserFromToken(mockValidJWT);
      
      expect(user).toBeDefined();
      expect(user?.id).toBe('1234567890');
      expect(user?.role).toBe(UserRole.ENTERPRISE_USER);
      expect(user?.permissions).toEqual(['read:detections', 'write:detections']);
    });

    it('should return null for invalid token', () => {
      const user = getUserFromToken('invalid-token');
      expect(user).toBeNull();
    });

    it('should return null for token with missing required claims', () => {
      const invalidToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3MDUyNDgwMDAsImlhdCI6MTcwNTE2MTYwMCwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDo4MDAwL2FwaS92MS9hdXRoL2xvZ2luIiwiYXVkIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwIn0';
      const user = getUserFromToken(invalidToken);
      expect(user).toBeNull();
    });
  });

  describe('Role-Based Access Control', () => {
    it('should validate role hierarchy correctly', () => {
      const adminUser = { role: UserRole.ADMIN } as any;
      const enterpriseUser = { role: UserRole.ENTERPRISE_USER } as any;
      const communityUser = { role: UserRole.COMMUNITY_USER } as any;
      const publicUser = { role: UserRole.PUBLIC_USER } as any;

      // Admin access checks
      expect(hasRequiredRole(adminUser, UserRole.PUBLIC_USER)).toBe(true);
      expect(hasRequiredRole(adminUser, UserRole.ADMIN)).toBe(true);

      // Enterprise user access checks
      expect(hasRequiredRole(enterpriseUser, UserRole.PUBLIC_USER)).toBe(true);
      expect(hasRequiredRole(enterpriseUser, UserRole.ENTERPRISE_USER)).toBe(true);
      expect(hasRequiredRole(enterpriseUser, UserRole.ADMIN)).toBe(false);

      // Community user access checks
      expect(hasRequiredRole(communityUser, UserRole.PUBLIC_USER)).toBe(true);
      expect(hasRequiredRole(communityUser, UserRole.COMMUNITY_USER)).toBe(true);
      expect(hasRequiredRole(communityUser, UserRole.ENTERPRISE_USER)).toBe(false);

      // Public user access checks
      expect(hasRequiredRole(publicUser, UserRole.PUBLIC_USER)).toBe(true);
      expect(hasRequiredRole(publicUser, UserRole.COMMUNITY_USER)).toBe(false);
    });

    it('should handle invalid role scenarios', () => {
      const invalidUser = { role: 'INVALID_ROLE' } as any;
      expect(hasRequiredRole(invalidUser, UserRole.PUBLIC_USER)).toBe(false);
      expect(hasRequiredRole({} as any, UserRole.PUBLIC_USER)).toBe(false);
      expect(hasRequiredRole(null as any, UserRole.PUBLIC_USER)).toBe(false);
    });
  });
});