import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const ThemeToggle = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative p-2 rounded-lg transition-colors duration-200
        text-gray-500 hover:text-gray-700 hover:bg-gray-100
        dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700
        ${className}`}
    >
      {/* Both icons always mounted; inactive one is opacity-0 + rotated */}
      <Sun
        className={`w-5 h-5 absolute inset-0 m-auto transition-all duration-300 ${
          isDark ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
        }`}
      />
      <Moon
        className={`w-5 h-5 absolute inset-0 m-auto transition-all duration-300 ${
          isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'
        }`}
      />
      {/* Invisible placeholder to hold button dimensions */}
      <span className="w-5 h-5 block opacity-0" aria-hidden="true" />
    </button>
  );
};

export default ThemeToggle;
