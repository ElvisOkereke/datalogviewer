import type { XRange } from '@/charts/range';
import { useLayoutStore } from './layoutStore';
import { useViewStore } from './viewStore';

/** Selects a range and brings up its statistics. */
export function selectRange(r: XRange): void {
  useViewStore.getState().select(r);
  if (!useViewStore.getState().selection) return;
  const layout = useLayoutStore.getState();
  layout.setInspectorOpen(true);
  layout.setInspectorTab('range');
}
