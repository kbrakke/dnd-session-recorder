'use client';

import { type Theme, themes, cycleTheme } from '../themes';

interface ThemeSelectorProps {
  currentTheme: Theme;
  onChange: (theme: Theme) => void;
}

/**
 * Compact theme-cycle button for the session page header.
 *
 * Displays the current theme icon + name (e.g. "Daylight") and cycles
 * to the next theme on click: daylight -> midnight -> tome -> daylight.
 */
export function ThemeSelector({ currentTheme, onChange }: ThemeSelectorProps) {
  const theme = themes[currentTheme];
  const ThemeIcon = theme.icon;

  const handleClick = () => {
    onChange(cycleTheme(currentTheme));
  };

  return (
    <button
      onClick={handleClick}
      title={`Current: ${theme.name} — Click to switch theme`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 600,
        padding: '5px 10px',
        borderRadius: '4px',
        border: '1px solid var(--sp-border-strong)',
        backgroundColor: 'var(--sp-bg-surface)',
        color: 'var(--sp-fg-2)',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      <ThemeIcon size={14} />
      {theme.name}
    </button>
  );
}
