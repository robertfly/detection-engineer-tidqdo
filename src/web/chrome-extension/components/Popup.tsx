// External imports with versions
import React, { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import type { Runtime } from 'chrome-types'; // v0.1.0

// Internal imports
import { IntelligenceAPI } from '../services/api';
import { StorageService, STORAGE_KEYS } from '../services/storage';
import { Capture } from './Capture';

// Types
interface PopupState {
  isAuthenticated: boolean;
  loading: Record<string, boolean>;
  error: ErrorState | null;
  userProfile: UserProfile | null;
  securityContext: SecurityContext | null;
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  lastLogin: string;
}

interface SecurityContext {
  tokenVersion: number;
  encryptionKey: string;
  lastValidated: string;
}

interface ErrorState {
  code: string;
  message: string;
  retry: boolean;
  timestamp: string;
}

/**
 * Enhanced Popup component with security features and error handling
 */
@withErrorBoundary
@withSecurityContext
export class Popup extends React.Component<{}, PopupState> {
  private api: IntelligenceAPI;
  private storage: StorageService;
  private retryQueue: Map<string, number>;
  private securityCheckInterval: NodeJS.Timeout | null;

  constructor(props: {}) {
    super(props);
    
    // Initialize services
    this.api = new IntelligenceAPI();
    this.storage = new StorageService();
    this.retryQueue = new Map();
    
    // Initialize state
    this.state = {
      isAuthenticated: false,
      loading: {},
      error: null,
      userProfile: null,
      securityContext: null
    };
  }

  /**
   * Component lifecycle methods with security checks
   */
  async componentDidMount() {
    try {
      // Initialize security context
      await this.initializeSecurityContext();
      
      // Check authentication status
      await this.checkAuth();
      
      // Setup periodic security checks
      this.securityCheckInterval = setInterval(
        () => this.performSecurityCheck(),
        300000 // 5 minutes
      );
      
      // Add storage change listener
      this.storage.addChangeListener(this.handleStorageChange);
      
    } catch (error) {
      this.handleError(error);
    }
  }

  componentWillUnmount() {
    if (this.securityCheckInterval) {
      clearInterval(this.securityCheckInterval);
    }
    this.storage.removeChangeListener(this.handleStorageChange);
  }

  /**
   * Enhanced authentication check with token validation
   */
  private async checkAuth(): Promise<void> {
    this.setLoading('auth', true);
    
    try {
      // Get encrypted token
      const token = await this.storage.get(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) {
        this.setState({ isAuthenticated: false });
        return;
      }

      // Validate token
      const isValid = await this.api.validateToken(token);
      if (!isValid) {
        await this.handleSecureLogout();
        return;
      }

      // Load user profile
      const encryptedProfile = await this.storage.get(STORAGE_KEYS.USER_PROFILE);
      if (encryptedProfile) {
        const profile = await this.storage.decryptData(encryptedProfile);
        this.setState({ 
          isAuthenticated: true,
          userProfile: profile
        });
      }

    } catch (error) {
      this.handleError(error);
    } finally {
      this.setLoading('auth', false);
    }
  }

  /**
   * Secure login handler with encryption
   */
  private async handleSecureLogin(credentials: { email: string; password: string }): Promise<void> {
    this.setLoading('login', true);
    
    try {
      // Encrypt credentials
      const encryptedCredentials = await this.api.encryptRequest(credentials);
      
      // Authenticate
      await this.api.authenticate(encryptedCredentials);
      
      // Refresh token
      const token = await this.api.refreshToken();
      await this.storage.secureSet(STORAGE_KEYS.AUTH_TOKEN, token);
      
      // Update security context
      await this.updateSecurityContext();
      
      // Set authenticated state
      this.setState({ isAuthenticated: true });
      
    } catch (error) {
      this.handleError(error);
      this.queueRetry('login', () => this.handleSecureLogin(credentials));
    } finally {
      this.setLoading('login', false);
    }
  }

  /**
   * Secure logout with cleanup
   */
  private async handleSecureLogout(): Promise<void> {
    this.setLoading('logout', true);
    
    try {
      // Clear sensitive data
      await this.storage.secureSet(STORAGE_KEYS.AUTH_TOKEN, null);
      await this.storage.secureSet(STORAGE_KEYS.USER_PROFILE, null);
      
      // Reset security context
      this.setState({
        isAuthenticated: false,
        userProfile: null,
        securityContext: null,
        error: null
      });
      
    } catch (error) {
      this.handleError(error);
    } finally {
      this.setLoading('logout', false);
    }
  }

  /**
   * Security context management
   */
  private async initializeSecurityContext(): Promise<void> {
    const context: SecurityContext = {
      tokenVersion: 1,
      encryptionKey: await this.generateSecureKey(),
      lastValidated: new Date().toISOString()
    };
    this.setState({ securityContext: context });
  }

  private async updateSecurityContext(): Promise<void> {
    if (!this.state.securityContext) return;
    
    const context: SecurityContext = {
      ...this.state.securityContext,
      lastValidated: new Date().toISOString()
    };
    this.setState({ securityContext: context });
  }

  /**
   * Error handling and retry logic
   */
  private handleError(error: unknown): void {
    const errorState: ErrorState = {
      code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      retry: true,
      timestamp: new Date().toISOString()
    };
    this.setState({ error: errorState });
  }

  private queueRetry(operation: string, retryFn: () => Promise<void>): void {
    const retryCount = (this.retryQueue.get(operation) || 0) + 1;
    if (retryCount <= 3) {
      this.retryQueue.set(operation, retryCount);
      setTimeout(() => {
        retryFn().catch(this.handleError.bind(this));
      }, Math.pow(2, retryCount) * 1000);
    }
  }

  /**
   * Utility methods
   */
  private setLoading(operation: string, isLoading: boolean): void {
    this.setState(prev => ({
      loading: {
        ...prev.loading,
        [operation]: isLoading
      }
    }));
  }

  private async generateSecureKey(): Promise<string> {
    const buffer = new Uint8Array(32);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private handleStorageChange = (changes: { [key: string]: any }): void => {
    if (changes[STORAGE_KEYS.AUTH_TOKEN]) {
      this.checkAuth().catch(this.handleError.bind(this));
    }
  };

  private async performSecurityCheck(): Promise<void> {
    if (this.state.isAuthenticated) {
      await this.checkAuth();
    }
  }

  /**
   * Render method
   */
  render() {
    const { isAuthenticated, loading, error, userProfile } = this.state;

    return (
      <div className="popup-container" role="main">
        {/* Error Display */}
        {error && (
          <div className="error-banner" role="alert">
            <p>{error.message}</p>
            {error.retry && (
              <button onClick={() => this.checkAuth()}>Retry</button>
            )}
          </div>
        )}

        {/* Authentication Section */}
        {!isAuthenticated ? (
          <div className="auth-section">
            <h2>Login Required</h2>
            <button
              onClick={() => this.handleSecureLogin({ email: '', password: '' })}
              disabled={loading.login}
            >
              {loading.login ? 'Logging in...' : 'Login'}
            </button>
          </div>
        ) : (
          <div className="authenticated-content">
            {/* User Profile */}
            {userProfile && (
              <div className="user-profile">
                <p>Welcome, {userProfile.email}</p>
                <p>Role: {userProfile.role}</p>
              </div>
            )}

            {/* Capture Component */}
            <Capture
              onSuccess={this.handleCaptureSuccess}
              onError={this.handleError.bind(this)}
            />

            {/* Logout Button */}
            <button
              onClick={() => this.handleSecureLogout()}
              disabled={loading.logout}
              className="logout-button"
            >
              {loading.logout ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        )}
      </div>
    );
  }

  private handleCaptureSuccess = (result: any): void => {
    // Handle successful capture
    console.log('Capture successful:', result);
  };
}

export type { PopupState, UserProfile, SecurityContext, ErrorState };