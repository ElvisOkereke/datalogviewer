import type uPlot from 'uplot';
import type { Channel, Log, TimeSource } from '@/data/types';
import type { BoundPane, BoundSeries } from '@/state/layout';
import type { ChartTheme } from './chartTheme';
import { resolveSeriesColor } from './palette';

export const SYNC_KEY = 'dlv';

/** uPlot draws a gap only for null, so NaN-bearing columns get a null-filled copy. */
export function toPlotValues(values: Float64Array): Float64Array | (number | null)[] {
  if (!values.some(Number.isNaN)) return values;
  return Array.from(values, (v) => (Number.isNaN(v) ? null : v));
}

/** Whole-log range padded 5%, so a scale doesn't jump while panning. */
export function seriesRange(
  ch: Channel,
  manual?: { min?: number; max?: number },
): [number, number] {
  let lo: number;
  let hi: number;
  if (!Number.isFinite(ch.min) || !Number.isFinite(ch.max)) [lo, hi] = [0, 1];
  else if (ch.max === ch.min) [lo, hi] = [ch.min - 1, ch.max + 1];
  else {
    const pad = (ch.max - ch.min) * 0.05;
    [lo, hi] = [ch.min - pad, ch.max + pad];
  }
  return [manual?.min ?? lo, manual?.max ?? hi];
}

export function formatValue(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
  return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function formatTime(t: number, source: TimeSource): string {
  if (source.kind === 'index') return `row ${Math.round(t)}`;
  return `${t.toLocaleString('en-US', { maximumFractionDigits: 3 })} s`;
}

const scaleKey = (s: BoundSeries, shared: boolean) => (shared ? 'y' : `y:${s.header}`);

export function buildPaneOptions(args: {
  pane: BoundPane;
  log: Log;
  theme: ChartTheme;
  width: number;
  height: number;
  axisHeader: string | null;
}): { opts: uPlot.Options; data: uPlot.AlignedData } {
  const { pane, log, theme, width, height } = args;
  const bound = pane.series.filter(
    (s): s is BoundSeries & { channel: Channel & { values: Float64Array } } =>
      s.channel?.values != null,
  );
  const shared = pane.sharedAxis;

  const scales: uPlot.Scales = { x: { time: false } };
  if (shared && bound.length) {
    const ranges = bound.map((s) => seriesRange(s.channel, s.scale));
    scales.y = {
      range: [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))],
    };
  } else {
    for (const s of bound) scales[scaleKey(s, false)] = { range: seriesRange(s.channel, s.scale) };
  }

  const axisSeries = bound.find((s) => s.header === args.axisHeader) ?? bound[0];
  const axisStyle = {
    stroke: theme.muted,
    font: `11px ${theme.monoFont}`,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.grid, width: 1 },
  };

  const opts: uPlot.Options = {
    width,
    height,
    scales,
    legend: { show: false },
    cursor: {
      sync: { key: SYNC_KEY },
      drag: { x: true, y: false, setScale: false },
      points: { show: false },
    },
    series: [
      {},
      ...bound.map((s): uPlot.Series => ({
        label: s.channel.name,
        scale: scaleKey(s, shared),
        stroke: resolveSeriesColor(s.color, theme.mode),
        width: 2,
        points: { show: false },
        spanGaps: false,
      })),
    ],
    axes: [
      {
        ...axisStyle,
        values: (_u, splits) => splits.map((t) => formatTime(t, log.timeSource)),
      },
      ...(axisSeries
        ? [
            {
              ...axisStyle,
              scale: scaleKey(axisSeries, shared),
              size: 56,
              values: (_u: uPlot, splits: number[]) => splits.map((v) => formatValue(v)),
            },
          ]
        : []),
    ],
  };

  const data = [log.time, ...bound.map((s) => toPlotValues(s.channel.values))] as uPlot.AlignedData;
  return { opts, data };
}
