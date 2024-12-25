/**
 * Main application header component implementing Material Design 3.0 specifications
 * with responsive behavior and theme support.
 * @version 1.0.0
 */

// React v18.2.0+
import React, { useState, useCallback } from 'react';
// @emotion/styled v11.11.0+
import styled from '@emotion/styled';

// Internal imports
import Avatar from '../common/Avatar';
import Button from '../common/Button';
import Dropdown from '../common/Dropdown';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

// Constants
const USER_MENU_ITEMS = [
  { label: 'Profile', value: 'profile' },
  { label: 'Settings', value: 'settings' },
  { label: 'Logout', value: 'logout' }
];

// Styled components following Material Design 3.0
const HeaderContainer = styled.header<{ isDarkMode: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background-color: ${({ theme, isDarkMode }) => 
    isDarkMode ? theme.palette.background.paper : '#FFFFFF'};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transition: background-color 0.2s ease-in-out;

  @media (max-width: 599px) {
    padding: 0 16px;
    height: 56px;
  }
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Logo = styled.img`
  height: 32px;
  width: auto;
`;

const NavigationSection = styled.nav`
  display: flex;
  align-items: center;
  gap: 24px;

  @media (max-width: 599px) {
    display: none;
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const ThemeToggle = styled(Button)`
  padding: 8px;
  min-width: 40px;
  border-radius: 20px;
`;

// Types
interface HeaderProps {
  onMenuClick?: () => void;
  className?: string;
}

/**
 * Main header component that implements Material Design 3.0 specifications
 * Provides navigation, user profile access, and theme controls
 */
const Header: React.FC<HeaderProps> = ({ onMenuClick, className }) => {
  // Hooks
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Handlers
  const handleUserMenuSelect = useCallback(async (value: string) => {
    setIsUserMenuOpen(false);
    
    if (value === 'logout') {
      try {
        await logout();
      } catch (error) {
        console.error('Logout failed:', error);
        // Error handling would be implemented here
      }
    }
    // Other menu item handlers would be implemented here
  }, [logout]);

  const handleMenuClick = useCallback(() => {
    onMenuClick?.();
  }, [onMenuClick]);

  return (
    <HeaderContainer isDarkMode={isDarkMode} className={className}>
      <LogoSection>
        <Button
          variant="text"
          aria-label="Menu"
          onClick={handleMenuClick}
          className="md:hidden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </Button>
        <Logo
          src="/logo.svg"
          alt="AI Detection Platform"
          aria-label="Platform Logo"
        />
      </LogoSection>

      <NavigationSection aria-label="Main Navigation">
        <Button variant="text">Dashboard</Button>
        <Button variant="text">Workbench</Button>
        <Button variant="text">Intelligence</Button>
        <Button variant="text">Libraries</Button>
        <Button variant="text">Community</Button>
      </NavigationSection>

      <UserSection>
        <ThemeToggle
          variant="text"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
        >
          {isDarkMode ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
            </svg>
          )}
        </ThemeToggle>

        {user && (
          <Dropdown
            label="User menu"
            options={USER_MENU_ITEMS}
            value={null}
            onChange={handleUserMenuSelect}
            isOpen={isUserMenuOpen}
            onOpenChange={setIsUserMenuOpen}
            renderTrigger={() => (
              <Avatar
                size="medium"
                src={user.avatarUrl}
                name={user.name}
                onClick={() => setIsUserMenuOpen(true)}
                aria-label="Open user menu"
              />
            )}
          />
        )}
      </UserSection>
    </HeaderContainer>
  );
};

export default Header;