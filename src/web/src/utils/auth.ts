/**
 * Enhanced authentication utility module for the AI-Driven Detection Engineering platform.
 * Implements secure token management, user session handling, and role-based authorization.
 * @version 1.0.0
 */

import { User, AuthResponse, UserRole } from '../types/auth';
import { API_ENDPOINTS } from '../config/api';
import jwtDecode from 'jwt-decode'; // v4.0.0
import CryptoJS from 'crypto-js'; // v4.2.0

// Encryption key for token storage - should be environment variable in production
const STORAGE_ENCRYPTION_KEY = process.env.VITE_STORAGE_ENCRYPTION_KEY || 'default-secure-key';

// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'encrypted_access_token',
  REFRESH_TOKEN: 'encrypted_refresh_token',
  MFA_TOKEN: 'encrypted_mfa_token'
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY: { [key in UserRole]: number } = {
  [UserRole.ADMIN]: 4,
  [UserRole.ENTERPRISE_USER]: 3,
  [UserRole.COMMUNITY_USER]: 2,
  [UserRole.PUBLIC_USER]: 1
};

/**
 * Interface for decoded JWT token payload
 */
interface JWTPayload {
  sub: string;
  role: UserRole;
  permissions: string[];
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

/**
 * Encrypts sensitive data for secure storage
 * @param data - Data to encrypt
 * @returns Encrypted string
 */
const encryptData = (data: string): string => {
  try {
    return CryptoJS.AES.encrypt(data, STORAGE_ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
};

/**
 * Decrypts sensitive data from secure storage
 * @param encryptedData - Encrypted data string
 * @returns Decrypted string or null if invalid
 */
const decryptData = (encryptedData: string): string | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, STORAGE_ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

/**
 * Securely retrieves and decrypts stored authentication tokens
 * @returns Object containing decrypted tokens or null values
 */
export const getStoredTokens = (): { 
  accessToken: string | null;
  refreshToken: string | null;
  mfaToken: string | null;
} => {
  try {
    const encryptedAccess = localStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN);
    const encryptedRefresh = localStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN);
    const encryptedMfa = localStorage.getItem(TOKEN_KEYS.MFA_TOKEN);

    return {
      accessToken: encryptedAccess ? decryptData(encryptedAccess) : null,
      refreshToken: encryptedRefresh ? decryptData(encryptedRefresh) : null,
      mfaToken: encryptedMfa ? decryptData(encryptedMfa) : null
    };
  } catch (error) {
    console.error('Token retrieval error:', error);
    return { accessToken: null, refreshToken: null, mfaToken: null };
  }
};

/**
 * Securely encrypts and stores authentication tokens
 * @param authResponse - Authentication response containing tokens
 */
export const setStoredTokens = (authResponse: AuthResponse): void => {
  try {
    // Validate tokens before storage
    if (!isValidToken(authResponse.accessToken) || !authResponse.refreshToken) {
      throw new Error('Invalid tokens provided');
    }

    // Encrypt and store tokens
    localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, encryptData(authResponse.accessToken));
    localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, encryptData(authResponse.refreshToken));
    
    if (authResponse.mfaToken) {
      localStorage.setItem(TOKEN_KEYS.MFA_TOKEN, encryptData(authResponse.mfaToken));
    }
  } catch (error) {
    console.error('Token storage error:', error);
    throw new Error('Failed to store authentication tokens');
  }
};

/**
 * Comprehensive JWT token validation with security checks
 * @param token - JWT token to validate
 * @returns Boolean indicating token validity
 */
export const isValidToken = (token: string): boolean => {
  try {
    if (!token) return false;

    const decoded = jwtDecode<JWTPayload>(token);
    const now = Date.now() / 1000;

    // Comprehensive token validation
    return Boolean(
      decoded &&
      decoded.exp > now && // Not expired
      decoded.iat < now && // Not used before issued
      decoded.iss === API_ENDPOINTS.AUTH.LOGIN.path && // Valid issuer
      decoded.aud === window.location.origin && // Valid audience
      decoded.sub && // Has subject
      decoded.role && // Has role
      Array.isArray(decoded.permissions) // Has permissions array
    );
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
};

/**
 * Securely extracts and validates user data from JWT token
 * @param token - JWT token containing user data
 * @returns Validated User object or null
 */
export const getUserFromToken = (token: string): User | null => {
  try {
    if (!isValidToken(token)) {
      return null;
    }

    const decoded = jwtDecode<JWTPayload>(token);
    
    // Validate required user data
    if (!decoded.sub || !decoded.role || !decoded.permissions) {
      throw new Error('Invalid user data in token');
    }

    // Construct and validate user object
    const user: User = {
      id: decoded.sub,
      role: decoded.role,
      permissions: decoded.permissions,
      mfaEnabled: false, // Default value, should be updated from user profile
      email: '', // Will be populated from user profile
      name: '', // Will be populated from user profile
      preferences: {
        theme: 'light',
        notifications: true,
        language: 'en',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      lastLogin: new Date()
    };

    return user;
  } catch (error) {
    console.error('User extraction error:', error);
    return null;
  }
};

/**
 * Enhanced role-based access control with hierarchical permissions
 * @param user - User object to check
 * @param requiredRole - Minimum required role
 * @returns Boolean indicating if user has required role or higher
 */
export const hasRequiredRole = (user: User, requiredRole: UserRole): boolean => {
  try {
    if (!user || !user.role || !ROLE_HIERARCHY[user.role]) {
      return false;
    }

    // Check role hierarchy
    const userRoleLevel = ROLE_HIERARCHY[user.role];
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

    return userRoleLevel >= requiredRoleLevel;
  } catch (error) {
    console.error('Role validation error:', error);
    return false;
  }
};

/**
 * Clears all stored authentication tokens securely
 */
export const clearStoredTokens = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(TOKEN_KEYS.MFA_TOKEN);
  } catch (error) {
    console.error('Token clearing error:', error);
    throw new Error('Failed to clear authentication tokens');
  }
};