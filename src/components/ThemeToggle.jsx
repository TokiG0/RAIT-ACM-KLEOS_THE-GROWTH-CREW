import React from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ theme, onToggleTheme }) {
  return (
    <button
      className="theme-toggle-btn"
      onClick={onToggleTheme}
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      aria-label="Toggle theme"
    >
      <div className={`theme-toggle-icon-wrapper ${theme}`}>
        {theme === 'light' ? (
          <Sun size={18} className="theme-icon sun-icon animate-spin-once" />
        ) : (
          <Moon size={18} className="theme-icon moon-icon animate-pulse-once" />
        )}
      </div>
    </button>
  );
}
