"use client";
import React from 'react';
import { useTheme } from './theme-provider';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDark}
      className="px-3 py-1 rounded border text-sm font-medium transition-colors bg-white text-black dark:bg-neutral-800 dark:text-neutral-100 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700"
    >
      {isDark ? 'Mode clair' : 'Mode sombre'}
    </button>
  );
};
