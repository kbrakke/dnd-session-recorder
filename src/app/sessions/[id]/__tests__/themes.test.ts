import { describe, it, expect } from 'vitest';
import { cycleTheme, isValidTheme, getTheme, themes, themeOrder, type Theme } from '../themes';

describe('Theme System', () => {
  describe('isValidTheme', () => {
    it('accepts every theme in themeOrder', () => {
      for (const theme of themeOrder) {
        expect(isValidTheme(theme)).toBe(true);
      }
    });

    it('rejects unknown theme names', () => {
      expect(isValidTheme('invalid')).toBe(false);
      expect(isValidTheme('')).toBe(false);
      expect(isValidTheme('DAYLIGHT')).toBe(false);
    });

    it('narrows the input type', () => {
      const value: string = 'tome';
      if (isValidTheme(value)) {
        const t: Theme = value;
        expect(t).toBe('tome');
      }
    });
  });

  describe('getTheme', () => {
    it('returns a config with name/icon/description for every theme', () => {
      for (const theme of themeOrder) {
        const config = getTheme(theme);
        expect(config.name).toBeTruthy();
        expect(config.description).toBeTruthy();
        expect(config.icon).toBeDefined();
      }
    });
  });

  describe('cycleTheme', () => {
    it('advances through themeOrder and wraps', () => {
      let current: Theme = themeOrder[0];
      const visited: Theme[] = [current];
      for (let i = 0; i < themeOrder.length; i++) {
        current = cycleTheme(current);
        visited.push(current);
      }
      expect(visited).toEqual([...themeOrder, themeOrder[0]]);
    });
  });

  describe('themes record', () => {
    it('contains an entry for every Theme in themeOrder', () => {
      for (const theme of themeOrder) {
        expect(themes[theme]).toBeDefined();
      }
      expect(Object.keys(themes).sort()).toEqual([...themeOrder].sort());
    });
  });
});
