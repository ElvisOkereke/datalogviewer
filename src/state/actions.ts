import type { XRange } from '@/charts/range';
import { nearestIndex } from '@/data/timeIndex';
import { useLayoutStore } from './layoutStore';
import { useMarkerStore, type Marker } from './markers';
import { useViewStore } from './viewStore';

/** Selects a range and brings up its statistics. */
export function selectRange(r: XRange): void {
  useViewStore.getState().select(r);
  if (!useViewStore.getState().selection) return;
  const layout = useLayoutStore.getState();
  layout.setInspectorOpen(true);
  layout.setInspectorTab('range');
}

/** Drops a marker at the cursor, or at the middle of the view when there is no cursor. */
export function addMarkerAtCursor(): void {
  const { cursor, time, range, bounds } = useViewStore.getState();
  const r = range ?? bounds;
  const t =
    cursor != null && time && cursor < time.length ? time[cursor] : r ? (r.min + r.max) / 2 : null;
  if (t !== null) useMarkerStore.getState().add(t);
}

/** Pins the cursor at a marker and brings it into view (same zoom). */
export function jumpToMarker(m: Marker): void {
  const view = useViewStore.getState();
  if (!view.time) return;
  view.pin(nearestIndex(view.time, m.t));
  const r = view.range ?? view.bounds;
  if (r && (m.t < r.min || m.t > r.max)) {
    const half = (r.max - r.min) / 2;
    view.setRange({ min: m.t - half, max: m.t + half });
  }
}
