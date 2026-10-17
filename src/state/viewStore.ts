import { create } from 'zustand';
import { clampRange, minSpanFor, panRange, zoomRange, type XRange } from '@/charts/range';
import { nearestIndex } from '@/data/timeIndex';

export interface ViewState {
  /** Visible x-range; null means the whole log. */
  range: XRange | null;
  bounds: XRange | null;
  minSpan: number;
  /** Sample index under the crosshair. */
  cursor: number | null;
  pinned: boolean;
  focusedPaneId: string | null;
  time: Float64Array | null;
  resetForLog(time: Float64Array): void;
  setRange(r: XRange): void;
  fit(): void;
  zoomAt(anchor: number, factor: number): void;
  pan(delta: number): void;
  setCursor(i: number | null): void;
  pin(i: number): void;
  unpin(): void;
  stepCursor(delta: number, rowCount: number): void;
  focusPane(id: string | null): void;
}

const same = (a: XRange, b: XRange) => a.min === b.min && a.max === b.max;

export const useViewStore = create<ViewState>()((set, get) => {
  const apply = (r: XRange) => {
    const { bounds, minSpan } = get();
    if (!bounds) return;
    const next = clampRange(r, bounds, minSpan);
    set({ range: same(next, bounds) ? null : next });
  };
  const current = () => get().range ?? get().bounds;

  return {
    range: null,
    bounds: null,
    minSpan: 1,
    cursor: null,
    pinned: false,
    focusedPaneId: null,
    time: null,

    resetForLog(time) {
      const n = time.length;
      const min = n ? time[0] : 0;
      const max = n ? time[n - 1] : 1;
      set({
        time,
        bounds: { min, max: max > min ? max : min + 1 },
        minSpan: minSpanFor(time),
        range: null,
        cursor: null,
        pinned: false,
      });
    },
    setRange: apply,
    fit() {
      set({ range: null });
    },
    zoomAt(anchor, factor) {
      const r = current();
      const { bounds, minSpan } = get();
      if (r && bounds) apply(zoomRange(r, anchor, factor, bounds, minSpan));
    },
    pan(delta) {
      const r = current();
      const { bounds } = get();
      if (r && bounds) apply(panRange(r, delta, bounds));
    },
    setCursor(i) {
      if (!get().pinned) set({ cursor: i });
    },
    pin(i) {
      set({ cursor: i, pinned: true });
    },
    unpin() {
      set({ pinned: false });
    },
    stepCursor(delta, rowCount) {
      if (rowCount < 1) return;
      const { cursor, time } = get();
      const r = current();
      const start = cursor ?? (time && r ? nearestIndex(time, r.min) : 0);
      set({ cursor: Math.min(Math.max(start + delta, 0), rowCount - 1), pinned: true });
    },
    focusPane(id) {
      set({ focusedPaneId: id });
    },
  };
});
