export type ThemePref = 'dark' | 'light' | 'system';

export const THEME_KEY = 'dlv.theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'dark' | 'light' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref: ThemePref): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = resolveTheme(pref, systemDark);
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked (private window): the theme still applies for this visit.
  }
}
