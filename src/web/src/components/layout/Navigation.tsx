// React v18.2.0+
import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import styled from '@emotion/styled';

// Internal imports
import Sidebar from '../common/Sidebar';
import { ROUTE_PATHS } from '../../config/routes';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

// Icons for navigation items
import {
  Dashboard as DashboardIcon,
  Code as WorkbenchIcon,
  Security as IntelligenceIcon,
  LibraryBooks as LibrariesIcon,
  Group as TeamIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';

// Styled components with theme support
const NavContainer = styled.nav<{ isDarkMode: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background-color: ${({ isDarkMode }) => isDarkMode ? '#1E1E1E' : '#FFFFFF'};
  color: ${({ isDarkMode }) => isDarkMode ? '#FFFFFF' : '#2C3E50'};
  transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 2px;
  }
`;

const NavSection = styled.div`
  margin-bottom: 2rem;

  h2 {
    font-size: 0.875rem;
    font-weight: 500;
    color: ${({ theme }) => theme.palette.text.secondary};
    margin: 0.5rem 1rem;
    text-transform: uppercase;
  }
`;

const NavItem = styled(Link)<{ isActive: boolean; isDarkMode: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: ${({ isActive, isDarkMode }) => 
    isActive ? isDarkMode ? '#FFFFFF' : '#2C3E50' : 
    isDarkMode ? '#B2B2B2' : '#7F8C8D'};
  background-color: ${({ isActive, isDarkMode }) => 
    isActive ? isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(25, 118, 210, 0.1)' : 'transparent'};
  text-decoration: none;
  transition: all 0.2s ease-in-out;

  &:hover {
    background-color: ${({ isDarkMode }) => 
      isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(25, 118, 210, 0.05)'};
  }

  &:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 2px;
  }

  svg {
    margin-right: 1rem;
    font-size: 1.25rem;
  }
`;

// Navigation item interface
interface NavigationItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  requiredPermission?: string;
  section?: string;
}

// Props interface
interface NavigationProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel?: string;
  focusTrapOptions?: any;
}

/**
 * Main navigation component with role-based access and accessibility features
 */
const Navigation: React.FC<NavigationProps> = React.memo(({
  isOpen,
  onClose,
  ariaLabel = 'Main Navigation',
  focusTrapOptions
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { isDarkMode } = useTheme();

  // Define navigation items with permissions
  const navigationItems = useMemo((): NavigationItem[] => [
    {
      path: ROUTE_PATHS.DASHBOARD,
      label: 'Dashboard',
      icon: <DashboardIcon />,
      requiredPermission: 'read:dashboard'
    },
    {
      path: ROUTE_PATHS.WORKBENCH,
      label: 'AI Workbench',
      icon: <WorkbenchIcon />,
      requiredPermission: 'write:detections'
    },
    {
      path: ROUTE_PATHS.INTELLIGENCE,
      label: 'Intelligence',
      icon: <IntelligenceIcon />,
      requiredPermission: 'read:intelligence'
    },
    {
      path: ROUTE_PATHS.LIBRARIES,
      label: 'Libraries',
      icon: <LibrariesIcon />,
      requiredPermission: 'read:libraries'
    },
    {
      section: 'Teams',
      path: ROUTE_PATHS.TEAMS,
      label: 'Team Management',
      icon: <TeamIcon />,
      requiredPermission: 'manage:teams'
    },
    {
      section: 'Settings',
      path: ROUTE_PATHS.SETTINGS,
      label: 'Settings',
      icon: <SettingsIcon />,
      requiredPermission: 'manage:settings'
    }
  ], []);

  // Filter navigation items based on permissions
  const filteredItems = useMemo(() => 
    navigationItems.filter(item => 
      !item.requiredPermission || hasPermission(item.requiredPermission)
    ),
    [navigationItems, hasPermission]
  );

  // Group items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, NavigationItem[]> = {
      main: []
    };

    filteredItems.forEach(item => {
      const section = item.section || 'main';
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(item);
    });

    return groups;
  }, [filteredItems]);

  // Handle navigation item click
  const handleNavClick = useCallback((path: string) => {
    navigate(path);
    onClose();
  }, [navigate, onClose]);

  return (
    <Sidebar
      isOpen={isOpen}
      onClose={onClose}
      focusTrapOptions={focusTrapOptions}
    >
      <NavContainer
        isDarkMode={isDarkMode}
        role="navigation"
        aria-label={ariaLabel}
      >
        {Object.entries(groupedItems).map(([section, items]) => (
          <NavSection key={section}>
            {section !== 'main' && (
              <h2 id={`nav-section-${section.toLowerCase()}`}>
                {section}
              </h2>
            )}
            {items.map(item => (
              <NavItem
                key={item.path}
                to={item.path}
                isActive={location.pathname === item.path}
                isDarkMode={isDarkMode}
                onClick={() => handleNavClick(item.path)}
                aria-current={location.pathname === item.path ? 'page' : undefined}
                aria-labelledby={section !== 'main' ? 
                  `nav-section-${section.toLowerCase()}` : undefined}
              >
                {item.icon}
                {item.label}
              </NavItem>
            ))}
          </NavSection>
        ))}
      </NavContainer>
    </Sidebar>
  );
});

// Display name for debugging
Navigation.displayName = 'Navigation';

export default Navigation;