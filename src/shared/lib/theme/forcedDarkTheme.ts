export const THEME_STORAGE_KEY = 'theme';

export type ThemePreference = 'light' | 'dark';

/**
 * Temporary dark-only theme policy.
 * Ignores OS preference and coerces any stored value to dark.
 */
export function resolveInitialTheme(_storedTheme: string | null): ThemePreference {
  return 'dark';
}

export function applyForcedDarkTheme(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.toggle('theme-dark', true);
  document.documentElement.classList.toggle('theme-light', false);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  }
}
