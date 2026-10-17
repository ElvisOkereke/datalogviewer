import { useEffect } from 'react';
import { useViewStore } from '@/state/viewStore';
import { shortcutFor } from './shortcuts';

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Window-level keyboard shortcuts for the Workbench (see ShortcutsDialog for the list). */
export function useShortcuts(onHelp: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = shortcutFor(e, isEditable(e.target));
      if (!action) return;
      const view = useViewStore.getState();
      const n = view.time?.length ?? 0;
      e.preventDefault();
      switch (action.type) {
        case 'step':
          view.stepCursor(action.delta, n);
          break;
        case 'home':
          if (n) view.pin(0);
          break;
        case 'end':
          if (n) view.pin(n - 1);
          break;
        case 'zoom': {
          const r = view.range ?? view.bounds;
          if (!r) break;
          const anchor =
            view.cursor != null && view.time ? view.time[view.cursor] : (r.min + r.max) / 2;
          view.zoomAt(anchor, action.factor);
          break;
        }
        case 'fit':
          view.fit();
          break;
        case 'unpin':
          view.unpin();
          break;
        case 'help':
          onHelp();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onHelp]);
}
