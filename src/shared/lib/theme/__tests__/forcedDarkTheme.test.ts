import { beforeEach, describe, expect, test } from '@jest/globals';

import { THEME_STORAGE_KEY, applyForcedDarkTheme, resolveInitialTheme } from '../forcedDarkTheme';

describe('forcedDarkTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('theme-light', 'theme-dark');
  });

  test('first visit without stored theme resolves to dark', () => {
    expect(resolveInitialTheme(null)).toBe('dark');
  });

  test('stored dark resolves to dark', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(resolveInitialTheme(localStorage.getItem(THEME_STORAGE_KEY))).toBe('dark');
  });

  test('stored light resolves to dark and applyForcedDarkTheme rewrites storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    expect(resolveInitialTheme(localStorage.getItem(THEME_STORAGE_KEY))).toBe('dark');

    applyForcedDarkTheme();

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });

  test('system theme is ignored because resolveInitialTheme always returns dark', () => {
    expect(resolveInitialTheme(null)).toBe('dark');
    expect(resolveInitialTheme('system')).toBe('dark');
  });
});
