export type ShortcutAction =
  | { type: 'step'; delta: number }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'zoom'; factor: number }
  | { type: 'fit' }
  | { type: 'unpin' }
  | { type: 'help' };

type KeyInfo = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** Maps a key press to a Workbench action; null while typing or when a browser modifier is held. */
export function shortcutFor(e: KeyInfo, targetIsEditable: boolean): ShortcutAction | null {
  if (targetIsEditable || e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight':
      return { type: 'step', delta: e.shiftKey ? 10 : 1 };
    case 'ArrowLeft':
      return { type: 'step', delta: e.shiftKey ? -10 : -1 };
    case 'Home':
      return { type: 'home' };
    case 'End':
      return { type: 'end' };
    case '+':
    case '=':
      return { type: 'zoom', factor: 0.8 };
    case '-':
      return { type: 'zoom', factor: 1.25 };
    case 'f':
    case 'F':
      return { type: 'fit' };
    case 'Escape':
      return { type: 'unpin' };
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}
