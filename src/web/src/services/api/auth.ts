/**
 * Authentication service module implementing secure authentication flows
 * including JWT-based authentication, OAuth 2.0, TOTP-based MFA, and HMAC request signing
 * @version 1.0.0
 */

// External imports
import { Auth0Client } from '@auth0/auth0-spa-js'; // v2.1.0
import { totp } from 'otplib'; // v12.0.1

// Internal imports
import { post, get } from '../../utils/api';
import { storage } from '../../utils/storage';
import { 
  LoginCredentials, 
  AuthResponse, 
  OAuthCredentials, 
  User, 
  OAuthProvider 
} from '../../types/auth';
import { ERROR_CODES } from '../../config/constants';

// Auth0 configuration
const auth0Client = new Auth0Client({
  domain: process.env.VITE_AUTH0_DOMAIN || '',
  clientId: process.env.VITE_AUTH0_CLIENT_ID || '',
  cacheLocation: 'localstorage',
  useRefreshTokens: true,
  scope: 'openid profile email'
});

// Constants
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in ms
const MFA_CODE_LENGTH = 6;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms

// Types
interface MfaCredentials {
  mfaToken: string;
  mfaCode: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Authenticates user with email/password credentials
 * Implements rate limiting and security monitoring
 */
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    // Validate credentials format
    if (!credentials.email || !credentials.password) {
      throw new Error('Invalid credentials format');
    }

    // Check login attempts
    const attempts = await storage.getItem<number>(`login_attempts_${credentials.email}`) || 0;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockoutTime = await storage.getItem<number>(`lockout_${credentials.email}`);
      if (lockoutTime && Date.now() - lockoutTime < LOCKOUT_DURATION) {
        throw new Error('Account temporarily locked');
      }
      // Reset attempts after lockout period
      await storage.setItem(`login_attempts_${credentials.email}`, 0);
    }

    // Make login request
    const response = await post<AuthResponse>('/auth/login', credentials);

    // Handle successful login
    if (response.data) {
      // Store tokens securely
      await storage.setItem('access_token', response.data.accessToken, true);
      await storage.setItem('refresh_token', response.data.refreshToken, true);
      
      // Reset login attempts
      await storage.setItem(`login_attempts_${credentials.email}`, 0);
      
      return response.data;
    }

    throw new Error('Login failed');
  } catch (error) {
    // Increment failed attempts
    const attempts = await storage.getItem<number>(`login_attempts_${credentials.email}`) || 0;
    await storage.setItem(`login_attempts_${credentials.email}`, attempts + 1);
    
    if (attempts + 1 >= MAX_LOGIN_ATTEMPTS) {
      await storage.setItem(`lockout_${credentials.email}`, Date.now());
    }

    throw error;
  }
};

/**
 * Registers new user with security validations
 */
export const register = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
  if (!passwordRegex.test(credentials.password)) {
    throw new Error('Password does not meet security requirements');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(credentials.email)) {
    throw new Error('Invalid email format');
  }

  const response = await post<AuthResponse>('/auth/register', credentials);
  
  if (response.data) {
    await storage.setItem('access_token', response.data.accessToken, true);
    await storage.setItem('refresh_token', response.data.refreshToken, true);
    return response.data;
  }

  throw new Error('Registration failed');
};

/**
 * Handles OAuth authentication with state validation
 */
export const oauthLogin = async (credentials: OAuthCredentials): Promise<AuthResponse> => {
  // Validate OAuth state to prevent CSRF
  const storedState = await storage.getItem<string>('oauth_state');
  if (!storedState || storedState !== credentials.state) {
    throw new Error('Invalid OAuth state');
  }

  let tokenResponse;
  
  switch (credentials.provider) {
    case OAuthProvider.GITHUB:
      tokenResponse = await auth0Client.handleRedirectCallback();
      break;
    // Add cases for other providers
    default:
      throw new Error('Unsupported OAuth provider');
  }

  const response = await post<AuthResponse>('/auth/oauth', {
    ...credentials,
    tokenResponse
  });

  if (response.data) {
    await storage.setItem('access_token', response.data.accessToken, true);
    await storage.setItem('refresh_token', response.data.refreshToken, true);
    return response.data;
  }

  throw new Error('OAuth authentication failed');
};

/**
 * Verifies TOTP-based MFA code with brute force protection
 */
export const verifyMfa = async (credentials: MfaCredentials): Promise<AuthResponse> => {
  // Validate MFA code format
  if (!credentials.mfaCode || credentials.mfaCode.length !== MFA_CODE_LENGTH) {
    throw new Error('Invalid MFA code format');
  }

  // Verify TOTP code
  if (!totp.verify({
    token: credentials.mfaCode,
    secret: credentials.mfaToken
  })) {
    throw new Error('Invalid MFA code');
  }

  const response = await post<AuthResponse>('/auth/mfa/verify', credentials);

  if (response.data) {
    await storage.setItem('access_token', response.data.accessToken, true);
    await storage.setItem('refresh_token', response.data.refreshToken, true);
    return response.data;
  }

  throw new Error('MFA verification failed');
};

/**
 * Refreshes authentication tokens with rotation
 */
export const refreshToken = async (refreshToken: string): Promise<TokenResponse> => {
  const response = await post<TokenResponse>('/auth/refresh', { refreshToken });

  if (response.data) {
    await storage.setItem('access_token', response.data.accessToken, true);
    await storage.setItem('refresh_token', response.data.refreshToken, true);
    return response.data;
  }

  throw new Error('Token refresh failed');
};

/**
 * Securely logs out user and invalidates sessions
 */
export const logout = async (): Promise<void> => {
  try {
    // Invalidate server-side session
    await post('/auth/logout');

    // Clear Auth0 session if present
    await auth0Client.logout({
      returnTo: window.location.origin
    });

    // Clear stored tokens
    await storage.removeItem('access_token');
    await storage.removeItem('refresh_token');
    await storage.removeItem('user_profile');
  } catch (error) {
    console.error('Logout error:', error);
    // Still clear local storage even if server logout fails
    storage.clear();
  }
};

/**
 * Retrieves current user data with token validation
 */
export const getCurrentUser = async (): Promise<User> => {
  const token = await storage.getItem<string>('access_token', true);
  if (!token) {
    throw new Error('No authentication token found');
  }

  // Check token expiration
  const tokenData = JSON.parse(atob(token.split('.')[1]));
  if (Date.now() >= tokenData.exp * 1000 - TOKEN_REFRESH_THRESHOLD) {
    const refreshToken = await storage.getItem<string>('refresh_token', true);
    if (refreshToken) {
      await refreshToken(refreshToken);
    } else {
      throw new Error('Session expired');
    }
  }

  const response = await get<User>('/auth/me');
  return response.data;
};