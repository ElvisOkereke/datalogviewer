import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { nextSeriesColor, type SeriesColor } from '@/charts/palette';
import type { Log } from '@/data/types';
import {
  defaultLayout,
  EMPTY_LAYOUT,
  migrateLayout,
  newPaneId,
  type CalculatedDef,
  type InspectorTab,
  type PaneLayout,
  type PersistedLayout,
  type ScatterConfig,
  type ViewMode,
} from './layout';

export interface LayoutState extends PersistedLayout {
  ensureLayoutFor(log: Log): void;
  resetLayout(log: Log): void;
  addPane(): string;
  removePane(id: string): void;
  setPaneSizes(sizes: Record<string, number>): void;
  addSeries(paneId: string, header: string): void;
  removeSeries(paneId: string, header: string): void;
  setSeriesColor(paneId: string, header: string, color: SeriesColor): void;
  setSeriesScale(paneId: string, header: string, scale?: { min?: number; max?: number }): void;
  toggleSharedAxis(paneId: string): void;
  setInspectorOpen(open: boolean): void;
  setView(view: ViewMode): void;
  setSidebarWidth(px: number): void;
  setInspectorTab(tab: InspectorTab): void;
  addCalculated(def: Omit<CalculatedDef, 'id'>): string;
  updateCalculated(id: string, patch: Partial<Omit<CalculatedDef, 'id'>>): void;
  removeCalculated(id: string): void;
  setScatter(cfg: ScatterConfig | null): void;
  replaceLayout(layout: PersistedLayout): void;
}

export const LAYOUT_KEY = 'dlv.layout.v2';
const LEGACY_LAYOUT_KEY = 'dlv.layout.v1';

/** localStorage that never throws: private windows and full quotas just stop remembering. */
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      // First run after the v2 upgrade: start from the v1 layout (migrated in `migrate`).
      return (
        localStorage.getItem(key) ??
        (key === LAYOUT_KEY ? localStorage.getItem(LEGACY_LAYOUT_KEY) : null)
      );
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered this time; the app keeps working.
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Same as above.
    }
  },
};

const evenly = (panes: PaneLayout[]) => panes.map((p) => ({ ...p, size: 100 / panes.length }));

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => {
      const updatePane = (id: string, fn: (p: PaneLayout) => PaneLayout) =>
        set({ panes: get().panes.map((p) => (p.id === id ? fn(p) : p)) });
      const updateSeries = (
        paneId: string,
        header: string,
        fn: (s: PaneLayout['series'][number]) => PaneLayout['series'][number],
      ) =>
        updatePane(paneId, (p) => ({
          ...p,
          series: p.series.map((s) => (s.header === header ? fn(s) : s)),
        }));

      return {
        ...EMPTY_LAYOUT,

        ensureLayoutFor(log) {
          if (get().panes.length === 0) set({ panes: defaultLayout(log).panes });
        },
        resetLayout(log) {
          set({ panes: defaultLayout(log).panes });
        },
        addPane() {
          const id = newPaneId();
          set({ panes: evenly([...get().panes, { id, size: 0, sharedAxis: false, series: [] }]) });
          return id;
        },
        removePane(id) {
          set({ panes: evenly(get().panes.filter((p) => p.id !== id)) });
        },
        setPaneSizes(sizes) {
          set({ panes: get().panes.map((p) => ({ ...p, size: sizes[p.id] ?? p.size })) });
        },
        addSeries(paneId, header) {
          updatePane(paneId, (p) =>
            p.series.some((s) => s.header === header)
              ? p
              : {
                  ...p,
                  series: [
                    ...p.series,
                    {
                      header,
                      color: nextSeriesColor(
                        get().panes.flatMap((q) => q.series.map((s) => s.color)),
                      ),
                    },
                  ],
                },
          );
        },
        removeSeries(paneId, header) {
          updatePane(paneId, (p) => ({
            ...p,
            series: p.series.filter((s) => s.header !== header),
          }));
        },
        setSeriesColor(paneId, header, color) {
          updateSeries(paneId, header, (s) => ({ ...s, color }));
        },
        setSeriesScale(paneId, header, scale) {
          updateSeries(paneId, header, (s) => {
            const next = { ...s };
            if (scale) next.scale = scale;
            else delete next.scale;
            return next;
          });
        },
        toggleSharedAxis(paneId) {
          updatePane(paneId, (p) => ({ ...p, sharedAxis: !p.sharedAxis }));
        },
        setInspectorOpen(inspectorOpen) {
          set({ inspectorOpen });
        },
        setView(view) {
          set({ view });
        },
        setSidebarWidth(sidebarWidth) {
          set({ sidebarWidth });
        },
        setInspectorTab(inspectorTab) {
          set({ inspectorTab });
        },
        addCalculated(def) {
          const id = `k-${Math.random().toString(36).slice(2, 10)}`;
          set({ calculated: [...get().calculated, { id, ...def }] });
          return id;
        },
        updateCalculated(id, patch) {
          set({ calculated: get().calculated.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
        },
        removeCalculated(id) {
          set({ calculated: get().calculated.filter((d) => d.id !== id) });
        },
        setScatter(scatter) {
          set({ scatter });
        },
        replaceLayout(layout) {
          set({ ...migrateLayout(layout) });
        },
      };
    },
    {
      name: LAYOUT_KEY,
      version: 2,
      migrate: (persisted) => migrateLayout(persisted),
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): PersistedLayout => ({
        version: s.version,
        panes: s.panes,
        sidebarWidth: s.sidebarWidth,
        inspectorOpen: s.inspectorOpen,
        inspectorTab: s.inspectorTab,
        view: s.view,
        calculated: s.calculated,
        scatter: s.scatter,
      }),
      merge: (persisted, current) => ({ ...current, ...migrateLayout(persisted) }),
    },
  ),
);
