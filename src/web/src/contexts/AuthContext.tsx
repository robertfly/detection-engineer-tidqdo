/**
 * Enhanced Authentication Context Provider for the AI-Driven Detection Engineering platform.
 * Implements secure authentication flows, MFA, role-based access control, and security monitoring.
 * @version 1.0.0
 */

import { 
  createContext, 
  useEffect, 
  useState, 
  useCallback, 
  useRef, 
  ReactNode 
} from 'react'; // v18.2.0+
import jwtDecode from 'jwt-decode'; // v3.1.2+

// Internal imports
import { 
  User, 
  AuthResponse, 
  LoginCredentials, 
  UserRole, 
  OAuthCredentials, 
  MfaCredentials 
} from '../types/auth';
import {
  login,
  register,
  oauthLogin,
  verifyMfa,
  refreshToken,
  logout,
  getCurrentUser,
  validateSession
} from '../services/api/auth';
import { storage } from '../utils/storage';
import { ERROR_CODES, STORAGE_CONSTANTS } from '../config/constants';

// Constants
const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
const SESSION_CHECK_INTERVAL = 60 * 1000; // 1 minute
const MAX_AUTH_RETRIES = 3;

// Types
interface SecurityEvent {
  type: 'login' | 'logout' | 'mfa' | 'session' | 'error';
  timestamp: Date;
  details: Record<string, unknown>;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMfaRequired: boolean;
  securityEvents: SecurityEvent[];
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: LoginCredentials) => Promise<void>;
  oauthLogin: (credentials: OAuthCredentials) => Promise<void>;
  verifyMfa: (token: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: string) => boolean;
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

// Create context with default values
export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isMfaRequired: false,
  securityEvents: [],
  login: async () => { throw new Error('AuthContext not initialized'); },
  register: async () => { throw new Error('AuthContext not initialized'); },
  oauthLogin: async () => { throw new Error('AuthContext not initialized'); },
  verifyMfa: async () => { throw new Error('AuthContext not initialized'); },
  logout: async () => { throw new Error('AuthContext not initialized'); },
  hasRole: () => false,
  hasPermission: () => false,
  validateSession: async () => false,
  refreshSession: async () => { throw new Error('AuthContext not initialized'); }
});

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Enhanced Authentication Provider Component
 * Manages authentication state, session handling, and security monitoring
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // State management
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMfaRequired, setIsMfaRequired] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);

  // Refs for intervals
  const refreshInterval = useRef<NodeJS.Timeout>();
  const sessionCheckInterval = useRef<NodeJS.Timeout>();
  const retryCount = useRef(0);

  /**
   * Logs security events for monitoring and auditing
   */
  const logSecurityEvent = useCallback((event: SecurityEvent) => {
    setSecurityEvents(prev => [...prev, event]);
    console.info('Security Event:', event);
  }, []);

  /**
   * Handles session refresh with retry logic
   */
  const refreshSession = useCallback(async () => {
    try {
      const refreshTokenValue = await storage.getItem<string>(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        true
      );

      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }

      const response = await refreshToken(refreshTokenValue);
      
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
        response.accessToken,
        true
      );
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        response.refreshToken,
        true
      );

      retryCount.current = 0;

      logSecurityEvent({
        type: 'session',
        timestamp: new Date(),
        details: { action: 'refresh', success: true }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'refresh', error }
      });

      if (retryCount.current < MAX_AUTH_RETRIES) {
        retryCount.current++;
        setTimeout(refreshSession, 1000 * retryCount.current);
      } else {
        await handleLogout();
      }
    }
  }, []);

  /**
   * Validates current session state
   */
  const validateCurrentSession = useCallback(async () => {
    try {
      const isValid = await validateSession();
      
      if (!isValid) {
        await handleLogout();
        return false;
      }

      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return true;
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'validate', error }
      });
      return false;
    }
  }, []);

  /**
   * Handles secure user login
   */
  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await login(credentials);

      if (response.mfaRequired) {
        setIsMfaRequired(true);
        await storage.setItem('mfa_token', response.mfaToken, true);
        
        logSecurityEvent({
          type: 'mfa',
          timestamp: new Date(),
          details: { action: 'required' }
        });
        return;
      }

      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
        response.accessToken,
        true
      );
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        response.refreshToken,
        true
      );

      setUser(response.user);
      setIsMfaRequired(false);

      logSecurityEvent({
        type: 'login',
        timestamp: new Date(),
        details: { success: true }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'login', error }
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles secure user registration
   */
  const handleRegister = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await register(credentials);
      setUser(response.user);

      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
        response.accessToken,
        true
      );
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        response.refreshToken,
        true
      );

      logSecurityEvent({
        type: 'login',
        timestamp: new Date(),
        details: { action: 'register', success: true }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'register', error }
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles OAuth-based login
   */
  const handleOAuthLogin = async (credentials: OAuthCredentials) => {
    setIsLoading(true);
    try {
      const response = await oauthLogin(credentials);
      setUser(response.user);

      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
        response.accessToken,
        true
      );
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        response.refreshToken,
        true
      );

      logSecurityEvent({
        type: 'login',
        timestamp: new Date(),
        details: { action: 'oauth', provider: credentials.provider }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'oauth_login', error }
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles MFA verification
   */
  const handleMfaVerify = async (token: string, code: string) => {
    setIsLoading(true);
    try {
      const response = await verifyMfa({ mfaToken: token, mfaCode: code });
      setUser(response.user);
      setIsMfaRequired(false);

      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
        response.accessToken,
        true
      );
      await storage.setItem(
        STORAGE_CONSTANTS.LOCAL_STORAGE_KEYS.REFRESH_TOKEN,
        response.refreshToken,
        true
      );

      logSecurityEvent({
        type: 'mfa',
        timestamp: new Date(),
        details: { action: 'verify', success: true }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'mfa_verify', error }
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles secure logout
   */
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      
      // Clear intervals
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }

      // Clear sensitive storage
      await storage.clear(true);

      logSecurityEvent({
        type: 'logout',
        timestamp: new Date(),
        details: { success: true }
      });
    } catch (error) {
      logSecurityEvent({
        type: 'error',
        timestamp: new Date(),
        details: { action: 'logout', error }
      });
      // Force clear storage even if logout fails
      await storage.clear(true);
    }
  };

  /**
   * Checks if user has specific role
   */
  const hasRole = useCallback((role: UserRole): boolean => {
    if (!user) return false;
    
    const roleHierarchy = {
      [UserRole.ADMIN]: 4,
      [UserRole.ENTERPRISE_USER]: 3,
      [UserRole.COMMUNITY_USER]: 2,
      [UserRole.PUBLIC_USER]: 1
    };

    return roleHierarchy[user.role] >= roleHierarchy[role];
  }, [user]);

  /**
   * Checks if user has specific permission
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    
    // Add your permission logic here based on user roles
    const rolePermissions: Record<UserRole, string[]> = {
      [UserRole.ADMIN]: ['*'],
      [UserRole.ENTERPRISE_USER]: ['read:*', 'write:*', 'delete:own'],
      [UserRole.COMMUNITY_USER]: ['read:*', 'write:community'],
      [UserRole.PUBLIC_USER]: ['read:public']
    };

    return rolePermissions[user.role].includes('*') || 
           rolePermissions[user.role].includes(permission);
  }, [user]);

  // Initialize authentication state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const isValid = await validateCurrentSession();
        
        if (isValid) {
          // Set up refresh interval
          refreshInterval.current = setInterval(refreshSession, TOKEN_REFRESH_INTERVAL);
          
          // Set up session check interval
          sessionCheckInterval.current = setInterval(validateCurrentSession, SESSION_CHECK_INTERVAL);
        }
      } catch (error) {
        logSecurityEvent({
          type: 'error',
          timestamp: new Date(),
          details: { action: 'init', error }
        });
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Cleanup intervals
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
      }
    };
  }, []);

  const contextValue: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isMfaRequired,
    securityEvents,
    login: handleLogin,
    register: handleRegister,
    oauthLogin: handleOAuthLogin,
    verifyMfa: handleMfaVerify,
    logout: handleLogout,
    hasRole,
    hasPermission,
    validateSession: validateCurrentSession,
    refreshSession
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};