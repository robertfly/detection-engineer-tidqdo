// React 18.2.0
import React, { Component } from 'react';
// Chrome extension types 0.1.0
import type { Storage } from 'chrome-types';
import { StorageService } from '../services/storage';

/**
 * Interface for component state
 */
interface OptionsState {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  saved: boolean;
  validationErrors: Record<string, string>;
  lastSaved: Date | null;
}

/**
 * Interface for user preferences with strict typing
 */
interface UserPreferences {
  autoSubmit: boolean;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark';
  apiEndpoint: string;
  refreshInterval: number;
  maxRetries: number;
  encryptionEnabled: boolean;
}

/**
 * Default preferences configuration with secure defaults
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  autoSubmit: false,
  notificationsEnabled: true,
  theme: 'light',
  apiEndpoint: 'https://api.detection-platform.com/v1',
  refreshInterval: 300000, // 5 minutes
  maxRetries: 3,
  encryptionEnabled: true,
};

/**
 * Validation schema for preferences
 */
const VALIDATION_RULES = {
  apiEndpoint: (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? '' : 'API endpoint must use HTTPS';
    } catch {
      return 'Invalid URL format';
    }
  },
  refreshInterval: (value: number) => 
    value >= 60000 && value <= 3600000 ? '' : 'Interval must be between 1 and 60 minutes',
  maxRetries: (value: number) =>
    value >= 1 && value <= 10 ? '' : 'Retries must be between 1 and 10',
};

/**
 * Options component for managing extension preferences with secure storage
 */
export default class Options extends Component<Record<string, never>, OptionsState> {
  private storageService: StorageService;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      preferences: { ...DEFAULT_PREFERENCES },
      loading: true,
      error: null,
      saved: false,
      validationErrors: {},
      lastSaved: null,
    };

    this.storageService = new StorageService();
  }

  /**
   * Load preferences when component mounts
   */
  public async componentDidMount(): Promise<void> {
    try {
      await this.loadPreferences();
      this.storageService.addChangeListener(this.handleStorageChange);
    } catch (error) {
      console.error('Failed to initialize options:', error);
      this.setState({ 
        error: 'Failed to load preferences. Please try refreshing the page.',
        loading: false 
      });
    }
  }

  /**
   * Cleanup listeners on unmount
   */
  public componentWillUnmount(): void {
    this.storageService.removeChangeListener(this.handleStorageChange);
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
  }

  /**
   * Securely loads preferences from storage
   */
  private loadPreferences = async (): Promise<void> => {
    this.setState({ loading: true, error: null });

    try {
      const storedPrefs = await this.storageService.get('user_preferences');
      const preferences = storedPrefs ? 
        { ...DEFAULT_PREFERENCES, ...storedPrefs } : 
        DEFAULT_PREFERENCES;

      this.setState({ 
        preferences,
        loading: false,
        validationErrors: this.validateAllPreferences(preferences)
      });
    } catch (error) {
      this.setState({
        loading: false,
        error: 'Failed to load preferences securely'
      });
    }
  };

  /**
   * Handles storage change events
   */
  private handleStorageChange = (event: Storage.StorageChange): void => {
    if (event.key === 'user_preferences') {
      this.loadPreferences();
    }
  };

  /**
   * Validates all preference fields
   */
  private validateAllPreferences = (prefs: UserPreferences): Record<string, string> => {
    const errors: Record<string, string> = {};
    
    // Validate URL
    const urlError = VALIDATION_RULES.apiEndpoint(prefs.apiEndpoint);
    if (urlError) errors.apiEndpoint = urlError;

    // Validate refresh interval
    const intervalError = VALIDATION_RULES.refreshInterval(prefs.refreshInterval);
    if (intervalError) errors.refreshInterval = intervalError;

    // Validate max retries
    const retriesError = VALIDATION_RULES.maxRetries(prefs.maxRetries);
    if (retriesError) errors.maxRetries = retriesError;

    return errors;
  };

  /**
   * Handles preference input changes with validation
   */
  private handlePreferenceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { name, value, type, checked } = event.target;
    const newValue = type === 'checkbox' ? checked : value;

    this.setState(prevState => {
      const preferences = {
        ...prevState.preferences,
        [name]: type === 'number' ? Number(newValue) : newValue
      };

      // Validate the changed field
      const validationErrors = {
        ...prevState.validationErrors,
        [name]: VALIDATION_RULES[name as keyof typeof VALIDATION_RULES]?.(preferences[name]) || ''
      };

      return {
        preferences,
        validationErrors,
        saved: false
      };
    }, this.debounceSave);
  };

  /**
   * Debounces save operations
   */
  private debounceSave = (): void => {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(this.savePreferences, 1000);
  };

  /**
   * Securely saves preferences to storage
   */
  private savePreferences = async (): Promise<void> => {
    const { preferences, validationErrors } = this.state;
    
    if (Object.keys(validationErrors).length > 0) {
      this.setState({ 
        error: 'Please correct validation errors before saving',
        saved: false 
      });
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      if (preferences.encryptionEnabled) {
        await this.storageService.set('user_preferences', 
          await this.storageService.encryptData(preferences)
        );
      } else {
        await this.storageService.set('user_preferences', preferences);
      }

      this.setState({
        saved: true,
        lastSaved: new Date(),
        loading: false
      });
    } catch (error) {
      this.setState({
        error: 'Failed to save preferences securely',
        loading: false
      });
    }
  };

  /**
   * Renders the options interface
   */
  public render(): JSX.Element {
    const { 
      preferences, 
      loading, 
      error, 
      saved, 
      validationErrors,
      lastSaved 
    } = this.state;

    return (
      <form className="options-form" onSubmit={e => e.preventDefault()}>
        <h1>Extension Options</h1>

        {/* Security Status Indicator */}
        <div className="security-status">
          <span className={`status-indicator ${preferences.encryptionEnabled ? 'secure' : 'warning'}`}>
            {preferences.encryptionEnabled ? 'Secure Storage Enabled' : 'Encryption Disabled'}
          </span>
        </div>

        {/* Preference Controls */}
        <div className="preference-section">
          <h2>General Settings</h2>
          
          <label>
            <input
              type="checkbox"
              name="encryptionEnabled"
              checked={preferences.encryptionEnabled}
              onChange={this.handlePreferenceChange}
            />
            Enable Secure Storage
          </label>

          <label>
            <input
              type="checkbox"
              name="autoSubmit"
              checked={preferences.autoSubmit}
              onChange={this.handlePreferenceChange}
            />
            Auto-submit Intelligence
          </label>

          <label>
            <input
              type="checkbox"
              name="notificationsEnabled"
              checked={preferences.notificationsEnabled}
              onChange={this.handlePreferenceChange}
            />
            Enable Notifications
          </label>

          <label>
            Theme
            <select
              name="theme"
              value={preferences.theme}
              onChange={this.handlePreferenceChange}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>

        <div className="preference-section">
          <h2>Advanced Settings</h2>

          <label>
            API Endpoint
            <input
              type="url"
              name="apiEndpoint"
              value={preferences.apiEndpoint}
              onChange={this.handlePreferenceChange}
              className={validationErrors.apiEndpoint ? 'error' : ''}
            />
            {validationErrors.apiEndpoint && (
              <span className="error-message">{validationErrors.apiEndpoint}</span>
            )}
          </label>

          <label>
            Refresh Interval (ms)
            <input
              type="number"
              name="refreshInterval"
              value={preferences.refreshInterval}
              onChange={this.handlePreferenceChange}
              min="60000"
              max="3600000"
              className={validationErrors.refreshInterval ? 'error' : ''}
            />
            {validationErrors.refreshInterval && (
              <span className="error-message">{validationErrors.refreshInterval}</span>
            )}
          </label>

          <label>
            Max Retries
            <input
              type="number"
              name="maxRetries"
              value={preferences.maxRetries}
              onChange={this.handlePreferenceChange}
              min="1"
              max="10"
              className={validationErrors.maxRetries ? 'error' : ''}
            />
            {validationErrors.maxRetries && (
              <span className="error-message">{validationErrors.maxRetries}</span>
            )}
          </label>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {saved && (
          <div className="success-banner" role="status">
            Settings saved successfully
            {lastSaved && ` at ${lastSaved.toLocaleTimeString()}`}
          </div>
        )}

        {/* Action Buttons */}
        <div className="actions">
          <button
            type="button"
            onClick={this.savePreferences}
            disabled={loading || Object.keys(validationErrors).length > 0}
          >
            {loading ? 'Saving...' : 'Save Preferences'}
          </button>

          <button
            type="button"
            onClick={() => this.setState({ 
              preferences: DEFAULT_PREFERENCES,
              saved: false 
            })}
            disabled={loading}
          >
            Reset to Defaults
          </button>
        </div>
      </form>
    );
  }
}