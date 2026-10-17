import { isSeriesColor, nextSeriesColor, type SeriesColor } from '@/charts/palette';
import type { CalculatedDef } from '@/data/calculated';
import { findChannel, MAX_HEADER_CHARS } from '@/data/channels';
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

export type ViewMode = 'chart' | 'scatter' | 'table';
export type InspectorTab = 'cursor' | 'range' | 'markers';

/** A formula channel; evaluated per log. */
export type { CalculatedDef };

/** Scatter view axes, by channel header. */
export interface ScatterConfig {
  x: string;
  y: string;
  color?: string;
}

export interface PersistedLayout {
  version: 2;
  panes: PaneLayout[];
  sidebarWidth: number;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  view: ViewMode;
  calculated: CalculatedDef[];
  scatter: ScatterConfig | null;
}

export const MAX_EXPRESSION_CHARS = 2000;
export const MAX_NAME_CHARS = 100;
/** Caps that keep a hand-made or hostile layout file from exhausting memory. */
export const MAX_PANES = 32;
export const MAX_SERIES_PER_PANE = 32;
export const MAX_CALCULATED = 64;

export interface BoundSeries extends SeriesRef {
  /** null when the saved series names a channel this log doesn't have. */
  channel: Channel | null;
}

export interface BoundPane extends Omit<PaneLayout, 'series'> {
  series: BoundSeries[];
}

export const EMPTY_LAYOUT: PersistedLayout = {
  version: 2,
  panes: [],
  sidebarWidth: 240,
  inspectorOpen: false,
  inspectorTab: 'cursor',
  view: 'chart',
  calculated: [],
  scatter: null,
};

export const newPaneId = () => `p-${Math.random().toString(36).slice(2, 10)}`;

/** Assigns colours that are unique across the whole layout, so colour follows the channel. */
function withSeries(headers: string[], used: string[]): SeriesRef[] {
  return headers.map((header) => {
    const color = nextSeriesColor(used);
    used.push(color);
    return { header, color };
  });
}

/** Spec §8: two panes — the first two numeric non-time channels, then the third. */
export function defaultLayout(log: Log): PersistedLayout {
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const plottable = log.channels
    .filter((c) => c.kind === 'numeric' && c.id !== timeId)
    .map((c) => c.header);
  const groups = [plottable.slice(0, 2), plottable.slice(2, 3)].filter((g) => g.length > 0);
  const used: string[] = [];
  return {
    ...EMPTY_LAYOUT,
    panes: groups.map((headers) => ({
      id: newPaneId(),
      size: 100 / groups.length,
      sharedAxis: false,
      series: withSeries(headers, used),
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

const isHeader = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_HEADER_CHARS;

function isSeriesRef(v: unknown): v is SeriesRef {
  if (!isObject(v) || !isHeader(v.header) || typeof v.color !== 'string') return false;
  if (!isSeriesColor(v.color)) return false;
  if (v.scale === undefined) return true;
  return isObject(v.scale) && optionalNumber(v.scale.min) && optionalNumber(v.scale.max);
}

function isPane(v: unknown): v is PaneLayout {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.size === 'number' &&
    Number.isFinite(v.size) &&
    v.size > 0 &&
    typeof v.sharedAxis === 'boolean' &&
    Array.isArray(v.series) &&
    v.series.length <= MAX_SERIES_PER_PANE &&
    v.series.every(isSeriesRef)
  );
}

const optionalString = (v: unknown) => v === undefined || typeof v === 'string';

function isCalculatedDef(v: unknown): v is CalculatedDef {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    v.name.length <= MAX_NAME_CHARS &&
    typeof v.expression === 'string' &&
    v.expression.length <= MAX_EXPRESSION_CHARS &&
    optionalString(v.unit) &&
    (v.unit === undefined || (v.unit as string).length <= MAX_NAME_CHARS)
  );
}

function isScatter(v: unknown): v is ScatterConfig | null {
  return (
    v === null ||
    (isObject(v) && isHeader(v.x) && isHeader(v.y) && (v.color === undefined || isHeader(v.color)))
  );
}

/** Shape shared by v1 and v2: panes (unique ids), sidebar width, inspector flag. */
function hasCommonShape(raw: Record<string, unknown>): raw is Record<string, unknown> & {
  panes: PaneLayout[];
  sidebarWidth: number;
  inspectorOpen: boolean;
} {
  return (
    Array.isArray(raw.panes) &&
    raw.panes.length <= MAX_PANES &&
    raw.panes.every(isPane) &&
    new Set(raw.panes.map((p: PaneLayout) => p.id)).size === raw.panes.length &&
    typeof raw.sidebarWidth === 'number' &&
    Number.isFinite(raw.sidebarWidth) &&
    typeof raw.inspectorOpen === 'boolean'
  );
}

/**
 * Accepts a structurally valid v1 layout (upgraded to v2) or v2 layout; anything else — corrupt,
 * future versions, out-of-range values — falls back to the empty layout.
 */
export function migrateLayout(raw: unknown): PersistedLayout {
  if (!isObject(raw) || !hasCommonShape(raw)) return EMPTY_LAYOUT;
  const common = {
    panes: raw.panes,
    sidebarWidth: raw.sidebarWidth,
    inspectorOpen: raw.inspectorOpen,
  };
  if (raw.version === 1 && (raw.view === 'chart' || raw.view === 'table')) {
    return { ...EMPTY_LAYOUT, ...common, view: raw.view };
  }
  if (
    raw.version === 2 &&
    (raw.view === 'chart' || raw.view === 'scatter' || raw.view === 'table') &&
    (raw.inspectorTab === 'cursor' ||
      raw.inspectorTab === 'range' ||
      raw.inspectorTab === 'markers') &&
    Array.isArray(raw.calculated) &&
    raw.calculated.length <= MAX_CALCULATED &&
    raw.calculated.every(isCalculatedDef) &&
    isScatter(raw.scatter)
  ) {
    return {
      version: 2,
      ...common,
      view: raw.view,
      inspectorTab: raw.inspectorTab,
      calculated: raw.calculated,
      scatter: raw.scatter,
    };
  }
  return EMPTY_LAYOUT;
}

/** The chart the sidebar targets: the focused pane if it still exists, else the first pane. */
export function selectedPaneId(panes: PaneLayout[], focusedPaneId: string | null): string | null {
  return panes.find((p) => p.id === focusedPaneId)?.id ?? panes[0]?.id ?? null;
}
