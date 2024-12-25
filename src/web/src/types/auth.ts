/**
 * Core authentication type definitions for the AI-Driven Detection Engineering platform.
 * Implements secure authentication and authorization types supporting multiple auth methods
 * and role-based access control.
 * @version 1.0.0
 */

/**
 * User role enum defining access levels for role-based access control (RBAC).
 * Maps to authorization matrix defined in security specifications.
 */
export enum UserRole {
  PUBLIC_USER = 'PUBLIC_USER',       // Read-only access to public detections
  COMMUNITY_USER = 'COMMUNITY_USER', // Read/write access to community detections
  ENTERPRISE_USER = 'ENTERPRISE_USER', // Full access to private enterprise features
  ADMIN = 'ADMIN'                    // Full system administrative access
}

/**
 * Interface defining user preferences structure.
 * Used within the User interface for storing user-specific settings.
 */
interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  defaultLibrary?: string;
  language: string;
  timezone: string;
}

/**
 * Comprehensive user data interface including profile, security settings,
 * and preferences. Core data structure for authenticated users.
 */
export interface User {
  id: string;                  // Unique user identifier
  email: string;              // User email address (unique)
  name: string;               // User display name
  role: UserRole;             // User role for RBAC
  preferences: UserPreferences; // User-specific settings
  lastLogin: Date;            // Timestamp of last login
  mfaEnabled: boolean;        // Whether MFA is enabled for user
}

/**
 * Login credentials interface for username/password authentication.
 * Supports optional MFA code and session persistence.
 */
export interface LoginCredentials {
  email: string;              // User email
  password: string;           // User password (Argon2id hashed server-side)
  mfaCode?: string;          // Optional TOTP-based MFA code
  rememberMe: boolean;        // Whether to persist session
}

/**
 * Authentication response interface containing JWT tokens and user data.
 * Used for managing authenticated sessions.
 */
export interface AuthResponse {
  user: User;                 // Authenticated user data
  accessToken: string;        // JWT access token (RS256 signed)
  refreshToken: string;       // JWT refresh token
  mfaRequired: boolean;       // Whether MFA verification is required
  mfaToken?: string;         // Temporary token for MFA flow
  expiresIn: number;         // Token expiration time in seconds
}

/**
 * Supported OAuth providers enum for SSO integration.
 */
export enum OAuthProvider {
  GITHUB = 'GITHUB',         // GitHub OAuth integration
  GOOGLE = 'GOOGLE',         // Google OAuth integration
  MICROSOFT = 'MICROSOFT'    // Microsoft OAuth integration
}

/**
 * OAuth credentials interface for SSO authentication flow.
 */
export interface OAuthCredentials {
  provider: OAuthProvider;    // OAuth provider type
  code: string;              // OAuth authorization code
  state: string;             // CSRF protection state
  scope: string;             // Requested OAuth scopes
  redirectUri: string;       // OAuth callback URL
}