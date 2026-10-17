import { beforeEach, describe, expect, test } from 'vitest';
import { applyTheme, readThemePref, resolveTheme, THEME_KEY } from '@/ui/theme';

describe('theme', () => {
  beforeEach(() => localStorage.clear());

  test('system preference follows the OS', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  test('defaults to system and ignores junk values', () => {
    expect(readThemePref()).toBe('system');
    localStorage.setItem(THEME_KEY, 'purple');
    expect(readThemePref()).toBe('system');
  });

  test('applyTheme sets data-theme and remembers the choice', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
