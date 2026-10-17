import { useEffect, useState } from 'react';
import { applyTheme, readThemePref, type ThemePref } from './theme';

const NEXT: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };

export function useTheme(): { pref: ThemePref; cycle: () => void } {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  return { pref, cycle: () => setPref((p) => NEXT[p]) };
}
