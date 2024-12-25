// React v18.2.0+
import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { useMediaQuery } from '@mui/material';

// Internal imports
import DashboardLayout from '../../layouts/DashboardLayout';
import Card from '../../components/common/Card';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import ErrorBoundary from '../../components/common/ErrorBoundary';

// Styled components with Material Design 3.0 specifications
const SettingsContainer = styled.div`
  display: grid;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  transition: all 0.3s ease;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    padding: 16px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
`;

// Section props interface
interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onSave?: (values: any) => Promise<void>;
}

// Settings section component
const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  children,
  icon,
  onSave
}) => {
  return (
    <Card
      elevation={2}
      variant="default"
      className="p-6"
      role="region"
      aria-label={title}
    >
      <SectionTitle>
        {icon && <span className="text-primary-500">{icon}</span>}
        {title}
      </SectionTitle>
      {children}
    </Card>
  );
};

// Main Settings component
const Settings: React.FC = React.memo(() => {
  // Hooks
  const { theme, isDarkMode, toggleTheme } = useTheme();
  const { user, manageMFA, manageAPIKeys } = useAuth();
  const isDesktop = useMediaQuery('(min-width: 1240px)');

  // State management
  const [notificationSettings, setNotificationSettings] = useState({
    email: true,
    push: true,
    slack: false
  });
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    reducedMotion: false,
    highContrast: false,
    fontSize: 'medium'
  });
  const [securitySettings, setSecuritySettings] = useState({
    mfaEnabled: user?.mfaEnabled || false,
    sessionTimeout: 30,
    apiKeysEnabled: false
  });

  // Handle theme preferences
  const handleThemeChange = useCallback(async () => {
    try {
      await toggleTheme();
    } catch (error) {
      console.error('Failed to update theme:', error);
    }
  }, [toggleTheme]);

  // Handle notification settings
  const handleNotificationChange = useCallback(async (settings: typeof notificationSettings) => {
    try {
      setNotificationSettings(settings);
      // API call to update notification preferences would go here
    } catch (error) {
      console.error('Failed to update notifications:', error);
    }
  }, []);

  // Handle accessibility settings
  const handleAccessibilityChange = useCallback(async (settings: typeof accessibilitySettings) => {
    try {
      setAccessibilitySettings(settings);
      document.documentElement.style.fontSize = settings.fontSize === 'large' ? '18px' : '16px';
      // API call to update accessibility preferences would go here
    } catch (error) {
      console.error('Failed to update accessibility settings:', error);
    }
  }, []);

  // Handle security settings
  const handleSecurityChange = useCallback(async (settings: typeof securitySettings) => {
    try {
      if (settings.mfaEnabled !== securitySettings.mfaEnabled) {
        await manageMFA(settings.mfaEnabled);
      }
      if (settings.apiKeysEnabled !== securitySettings.apiKeysEnabled) {
        await manageAPIKeys(settings.apiKeysEnabled);
      }
      setSecuritySettings(settings);
    } catch (error) {
      console.error('Failed to update security settings:', error);
    }
  }, [securitySettings, manageMFA, manageAPIKeys]);

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <SettingsContainer>
          {/* Theme Settings */}
          <SettingsSection title="Theme Preferences">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Dark Mode</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={isDarkMode}
                    onChange={handleThemeChange}
                    aria-label="Toggle dark mode"
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </SettingsSection>

          {/* Notification Settings */}
          <SettingsSection title="Notifications">
            <div className="space-y-4">
              {Object.entries(notificationSettings).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="capitalize">{key} Notifications</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => handleNotificationChange({
                        ...notificationSettings,
                        [key]: e.target.checked
                      })}
                      aria-label={`Toggle ${key} notifications`}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              ))}
            </div>
          </SettingsSection>

          {/* Accessibility Settings */}
          <SettingsSection title="Accessibility">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Reduced Motion</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.reducedMotion}
                    onChange={(e) => handleAccessibilityChange({
                      ...accessibilitySettings,
                      reducedMotion: e.target.checked
                    })}
                    aria-label="Toggle reduced motion"
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span>High Contrast</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.highContrast}
                    onChange={(e) => handleAccessibilityChange({
                      ...accessibilitySettings,
                      highContrast: e.target.checked
                    })}
                    aria-label="Toggle high contrast"
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span>Font Size</span>
                <select
                  value={accessibilitySettings.fontSize}
                  onChange={(e) => handleAccessibilityChange({
                    ...accessibilitySettings,
                    fontSize: e.target.value
                  })}
                  className="form-select"
                  aria-label="Select font size"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          </SettingsSection>

          {/* Security Settings */}
          <SettingsSection title="Security">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Two-Factor Authentication</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={securitySettings.mfaEnabled}
                    onChange={(e) => handleSecurityChange({
                      ...securitySettings,
                      mfaEnabled: e.target.checked
                    })}
                    aria-label="Toggle two-factor authentication"
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span>API Keys</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={securitySettings.apiKeysEnabled}
                    onChange={(e) => handleSecurityChange({
                      ...securitySettings,
                      apiKeysEnabled: e.target.checked
                    })}
                    aria-label="Toggle API keys"
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span>Session Timeout (minutes)</span>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={securitySettings.sessionTimeout}
                  onChange={(e) => handleSecurityChange({
                    ...securitySettings,
                    sessionTimeout: parseInt(e.target.value)
                  })}
                  className="form-input w-20"
                  aria-label="Set session timeout"
                />
              </div>
            </div>
          </SettingsSection>
        </SettingsContainer>
      </ErrorBoundary>
    </DashboardLayout>
  );
});

// Display name for debugging
Settings.displayName = 'Settings';

export default Settings;