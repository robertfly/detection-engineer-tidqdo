// React v18.2.0+
import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
// @mui/material v5.0.0+
import { ThemeProvider } from '@mui/material';
import { lightTheme, darkTheme, Theme } from '../config/theme';

// Constants
const THEME_STORAGE_KEY = 'theme-preference';

// Theme context type definition
interface ThemeContextType {
  theme: Theme;
  isDarkMode: boolean;
  toggleTheme: () => void;
  systemPreference: boolean | null;
}

// Props interface for the provider component
interface ThemeProviderProps {
  children: ReactNode;
}

// Create the context with undefined default value
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Custom hook for accessing theme context with type safety
 * @throws {Error} When used outside of ThemeContextProvider
 * @returns {ThemeContextType} Theme context value
 */
export const useThemeContext = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeContextProvider');
  }
  return context;
};

/**
 * Theme context provider component that handles theme management
 * Implements system preference detection and theme persistence
 */
export const ThemeContextProvider = ({ children }: ThemeProviderProps): JSX.Element => {
  // Initialize system preference media query
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  // State management
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedPreference) {
      return storedPreference === 'dark';
    }
    return systemThemeQuery.matches;
  });

  const [systemPreference, setSystemPreference] = useState<boolean | null>(
    systemThemeQuery.matches
  );

  // Memoize the current theme to prevent unnecessary re-renders
  const currentTheme = useMemo(
    () => (isDarkMode ? darkTheme : lightTheme),
    [isDarkMode]
  );

  /**
   * Handle system theme preference changes
   * @param {MediaQueryListEvent} event - System theme change event
   */
  const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
    const newPreference = event.matches;
    setSystemPreference(newPreference);
    
    // Only update theme if no stored preference exists
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      setIsDarkMode(newPreference);
    }
  };

  /**
   * Toggle between light and dark themes
   * Persists preference and announces change for accessibility
   */
  const toggleTheme = (): void => {
    setIsDarkMode((prev) => {
      const newMode = !prev;
      localStorage.setItem(THEME_STORAGE_KEY, newMode ? 'dark' : 'light');
      
      // Announce theme change for screen readers
      const message = `Theme changed to ${newMode ? 'dark' : 'light'} mode`;
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(message);
        window.speechSynthesis.speak(utterance);
      }
      
      return newMode;
    });
  };

  // Set up system theme change listener
  useEffect(() => {
    // Add event listener for system theme changes
    systemThemeQuery.addEventListener('change', handleSystemThemeChange);

    // Cleanup listener on component unmount
    return () => {
      systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  // Context value with memoization to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      theme: currentTheme,
      isDarkMode,
      toggleTheme,
      systemPreference,
    }),
    [currentTheme, isDarkMode, systemPreference]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeProvider theme={currentTheme}>
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};