import { nextSeriesColor, type SeriesColor } from '@/charts/palette';
import { findChannel } from '@/data/channels';
import type { Channel, Log } from '@/data/types';

export interface SeriesRef {
  header: string;
  color: SeriesColor;
  scale?: { min?: number; max?: number };
}

export interface PaneLayout {
  id: string;
  /** Percentage of the pane stack's height. */
  size: number;
  sharedAxis: boolean;
  series: SeriesRef[];
}

export interface PersistedLayout {
  version: 1;
  panes: PaneLayout[];
  sidebarWidth: number;
  inspectorOpen: boolean;
  view: 'chart' | 'table';
}

export interface BoundSeries extends SeriesRef {
  /** null when the saved series names a channel this log doesn't have. */
  channel: Channel | null;
}

export interface BoundPane extends Omit<PaneLayout, 'series'> {
  series: BoundSeries[];
}

export const EMPTY_LAYOUT: PersistedLayout = {
  version: 1,
  panes: [],
  sidebarWidth: 240,
  inspectorOpen: false,
  view: 'chart',
};

export const newPaneId = () => `p-${Math.random().toString(36).slice(2, 10)}`;

function withSeries(headers: string[]): SeriesRef[] {
  const series: SeriesRef[] = [];
  for (const header of headers) {
    series.push({ header, color: nextSeriesColor(series.map((s) => s.color)) });
  }
  return series;
}

/** Spec §8: two panes — the first two numeric non-time channels, then the third. */
export function defaultLayout(log: Log): PersistedLayout {
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const plottable = log.channels
    .filter((c) => c.kind === 'numeric' && c.id !== timeId)
    .map((c) => c.header);
  const groups = [plottable.slice(0, 2), plottable.slice(2, 3)].filter((g) => g.length > 0);
  return {
    ...EMPTY_LAYOUT,
    panes: groups.map((headers) => ({
      id: newPaneId(),
      size: 100 / groups.length,
      sharedAxis: false,
      series: withSeries(headers),
    })),
  };
}

export function bindLayout(layout: PersistedLayout, log: Log): BoundPane[] {
  return layout.panes.map((pane) => ({
    ...pane,
    series: pane.series.map((s) => ({ ...s, channel: findChannel(log, s.header) ?? null })),
  }));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const optionalNumber = (v: unknown) => v === undefined || typeof v === 'number';

function isSeriesRef(v: unknown): v is SeriesRef {
  if (!isObject(v) || typeof v.header !== 'string' || typeof v.color !== 'string') return false;
  if (v.scale === undefined) return true;
  return isObject(v.scale) && optionalNumber(v.scale.min) && optionalNumber(v.scale.max);
}

function isPane(v: unknown): v is PaneLayout {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.size === 'number' &&
    typeof v.sharedAxis === 'boolean' &&
    Array.isArray(v.series) &&
    v.series.every(isSeriesRef)
  );
}

/** Accepts only a structurally valid version-1 layout; anything else (corrupt, future) → empty. */
export function migrateLayout(raw: unknown): PersistedLayout {
  if (
    isObject(raw) &&
    raw.version === 1 &&
    Array.isArray(raw.panes) &&
    raw.panes.every(isPane) &&
    typeof raw.sidebarWidth === 'number' &&
    typeof raw.inspectorOpen === 'boolean' &&
    (raw.view === 'chart' || raw.view === 'table')
  ) {
    return {
      version: 1,
      panes: raw.panes,
      sidebarWidth: raw.sidebarWidth,
      inspectorOpen: raw.inspectorOpen,
      view: raw.view,
    };
  }
  return EMPTY_LAYOUT;
}
