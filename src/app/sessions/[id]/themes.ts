// Theme system for Session page
// 3 themes matching the StoryScribe design system:
// - Daylight: clean light (default production look)
// - Midnight: dark UI
// - Tome: parchment/ancient book feel
import { Sun, Moon, BookOpen } from 'lucide-react';

export type Theme = 'daylight' | 'midnight' | 'tome';

export interface ThemeConfig {
  name: string;
  icon: typeof Sun;
  description: string;
}

export const themes: Record<Theme, ThemeConfig> = {
  daylight: {
    name: 'Daylight',
    icon: Sun,
    description: 'Clean light theme — the default production look',
  },
  midnight: {
    name: 'Midnight',
    icon: Moon,
    description: 'Dark UI with warm manuscript glow',
  },
  tome: {
    name: 'Ancient Tome',
    icon: BookOpen,
    description: 'Parchment canvas, burnt-sienna primary, gold accents',
  },
};

export const themeOrder: Theme[] = ['daylight', 'midnight', 'tome'];

export function getTheme(theme: Theme): ThemeConfig {
  return themes[theme];
}

export function cycleTheme(currentTheme: Theme): Theme {
  const currentIndex = themeOrder.indexOf(currentTheme);
  return themeOrder[(currentIndex + 1) % themeOrder.length];
}

export function isValidTheme(value: string): value is Theme {
  return themeOrder.includes(value as Theme);
}
