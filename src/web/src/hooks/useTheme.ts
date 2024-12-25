// React v18.2.0+
import { useCallback } from 'react';
import { useThemeContext } from '../contexts/ThemeContext';

/**
 * Interface defining the return type of the useTheme hook
 * Provides theme state and control functions with Material Design 3.0 support
 */
interface UseThemeReturn {
  /**
   * Current theme object containing Material Design 3.0 tokens
   * Includes palette, typography, spacing, and shape configurations
   */
  theme: Theme;
  
  /**
   * Boolean indicating whether dark mode is currently active
   * True for dark mode, false for light mode
   */
  isDarkMode: boolean;
  
  /**
   * Function to toggle between light and dark themes
   * Persists preference and handles accessibility announcements
   */
  toggleTheme: () => void;
}

/**
 * Custom hook that provides theme management functionality with Material Design 3.0 support
 * Handles theme state, dark mode detection, and theme persistence
 * 
 * @returns {UseThemeReturn} Object containing theme state and control functions
 * @throws {Error} When used outside of ThemeContextProvider
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const { theme, isDarkMode, toggleTheme } = useTheme();
 *   
 *   return (
 *     <Button onClick={toggleTheme}>
 *       Toggle {isDarkMode ? 'Light' : 'Dark'} Mode
 *     </Button>
 *   );
 * };
 * ```
 */
export const useTheme = (): UseThemeReturn => {
  // Get theme context values and validate context access
  const { theme, isDarkMode, toggleTheme: contextToggleTheme } = useThemeContext();

  // Memoize toggleTheme function to prevent unnecessary re-renders
  const toggleTheme = useCallback(() => {
    contextToggleTheme();
  }, [contextToggleTheme]);

  return {
    theme,
    isDarkMode,
    toggleTheme,
  };
};

// Export type for external usage
export type { UseThemeReturn };