import { useEffect } from 'react';
import { useViewStore } from '@/state/viewStore';
import { shortcutFor } from './shortcuts';

const OWN_KEYS =
  '[role=menu],[role=menuitem],[role=dialog],[role=alertdialog],[role=group],[role=radiogroup],[role=listbox],[data-radix-popper-content-wrapper]';

/** True when the key belongs to whatever has focus (a field, menu, dialog, button group). */
export function isShortcutBlocked(target: EventTarget | null, defaultPrevented: boolean): boolean {
  if (defaultPrevented) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  return target.closest(OWN_KEYS) !== null;
}

/** Window-level keyboard shortcuts for the Workbench (see ShortcutsDialog for the list). */
export function useShortcuts(onHelp: () => void): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = shortcutFor(e, isShortcutBlocked(e.target, e.defaultPrevented));
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
        case 'escape':
          // First Esc clears a selection; the next releases a pinned cursor.
          if (view.selection) view.clearSelection();
          else view.unpin();
          break;
        case 'zoomSelection':
          view.zoomToSelection();
          break;
        case 'marker':
          // Wired up with markers (Plan C Task 9).
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
