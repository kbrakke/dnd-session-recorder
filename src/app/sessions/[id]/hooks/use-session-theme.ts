'use client';

import { useState, useEffect } from 'react';
import { type Theme, isValidTheme } from '../themes';

const THEME_STORAGE_KEY = 'session-theme';

/**
 * Custom hook for managing session theme state with localStorage persistence.
 * Sets data-theme attribute on the document element for CSS variable theming.
 */
export function useSessionTheme() {
  const [theme, setThemeState] = useState<Theme>('daylight');

  // Load theme from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && isValidTheme(stored)) {
        setThemeState(stored);
      }
    }
  }, []);

  // Apply data-theme attribute whenever theme changes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    return () => {
      // Clean up when component unmounts (navigating away from session page)
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute('data-theme');
      }
    };
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    }
  };

  return { theme, setTheme };
}
