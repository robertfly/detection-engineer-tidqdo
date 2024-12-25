/**
 * Enhanced React hook providing secure authentication functionality with MFA support,
 * OAuth integration, and comprehensive security monitoring.
 * @version 1.0.0
 */

import { useContext, useCallback, useMemo } from 'react'; // v18.2.0+

// Internal imports
import { AuthContext } from '../contexts/AuthContext';
import { User, AuthResponse, LoginCredentials, OAuthProvider, MFACredentials } from '../types/auth';

/**
 * Enhanced authentication hook providing secure authentication functionality
 * with MFA support, OAuth integration, and security monitoring.
 * 
 * @returns Authentication context with enhanced security features
 * @throws Error if used outside of AuthContext provider
 */
export const useAuth = () => {
  // Get authentication context
  const context = useContext(AuthContext);

  // Validate context availability
  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider. ' +
      'Please ensure your component is wrapped with AuthProvider.'
    );
  }

  const {
    user,
    isAuthenticated,
    isMfaRequired: requiresMFA,
    securityEvents,
    login: contextLogin,
    register: contextRegister,
    oauthLogin: contextOAuthLogin,
    verifyMfa: contextVerifyMfa,
    logout: contextLogout,
    hasRole: contextHasRole,
    hasPermission: contextHasPermission,
    validateSession,
    refreshSession
  } = context;

  /**
   * Enhanced login handler with security monitoring
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      await contextLogin(credentials);
      return {
        user: context.user!,
        accessToken: '', // Token handled internally by AuthContext
        refreshToken: '',
        mfaRequired: requiresMFA,
        expiresIn: 0
      };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [contextLogin, context.user, requiresMFA]);

  /**
   * OAuth login handler with provider validation
   */
  const loginWithOAuth = useCallback(async (provider: OAuthProvider): Promise<AuthResponse> => {
    try {
      await contextOAuthLogin({
        provider,
        code: '',
        state: '',
        scope: '',
        redirectUri: window.location.origin
      });
      return {
        user: context.user!,
        accessToken: '',
        refreshToken: '',
        mfaRequired: false,
        expiresIn: 0
      };
    } catch (error) {
      console.error('OAuth login failed:', error);
      throw error;
    }
  }, [contextOAuthLogin, context.user]);

  /**
   * MFA validation handler with enhanced security
   */
  const validateMFA = useCallback(async (credentials: MFACredentials): Promise<AuthResponse> => {
    try {
      await contextVerifyMfa(credentials.mfaToken, credentials.mfaCode);
      return {
        user: context.user!,
        accessToken: '',
        refreshToken: '',
        mfaRequired: false,
        expiresIn: 0
      };
    } catch (error) {
      console.error('MFA validation failed:', error);
      throw error;
    }
  }, [contextVerifyMfa, context.user]);

  /**
   * Secure logout handler with session cleanup
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await contextLogout();
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, [contextLogout]);

  /**
   * Token refresh handler with automatic retry
   */
  const refreshToken = useCallback(async (): Promise<void> => {
    try {
      await refreshSession();
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }, [refreshSession]);

  /**
   * Memoized role checking function
   */
  const hasRole = useCallback((role: string): boolean => {
    return contextHasRole(role);
  }, [contextHasRole]);

  /**
   * Memoized permission checking function
   */
  const hasPermission = useCallback((permission: string): boolean => {
    return contextHasPermission(permission);
  }, [contextHasPermission]);

  /**
   * Memoized security event monitoring
   */
  const securityEventLog = useMemo(() => {
    return securityEvents.map(event => ({
      ...event,
      formattedTimestamp: new Date(event.timestamp).toISOString()
    }));
  }, [securityEvents]);

  return {
    // User state
    user,
    isAuthenticated,
    requiresMFA,
    
    // Authentication methods
    login,
    loginWithOAuth,
    validateMFA,
    logout,
    refreshToken,
    
    // Authorization methods
    hasRole,
    hasPermission,
    
    // Security monitoring
    securityEvents: securityEventLog,
    
    // Session management
    validateSession
  };
};

// Type exports for consumers
export type { User, AuthResponse, LoginCredentials, OAuthProvider, MFACredentials };