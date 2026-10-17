import { findChannel } from '@/data/channels';
import type { Channel, Log } from '@/data/types';
import type { ScatterConfig } from '@/state/layout';
import type { XRange } from './range';

export type ScatterScope = 'view' | 'selection' | 'all';

export type ScatterPoints =
  | {
      x: Float64Array;
      y: Float64Array;
      c: Float64Array | null;
      t: Float64Array;
      /** Headers of the channels actually plotted (the config may name them loosely). */
      labels: { x: string; y: string; color: string | null };
      /** Points available in scope; `shown` ≤ `total` after sampling. */
      total: number;
      shown: number;
    }
  | { error: string };

type Plottable = Channel & { values: Float64Array };

function resolve(log: Log, header: string): Plottable | string {
  const ch = findChannel(log, header);
  if (!ch) return `[${header}] isn't in this log`;
  if (!ch.values) return `[${header}] is a text channel`;
  return ch as Plottable;
}

/**
 * The (x, y[, colour]) pairs to plot: rows in `scope` (null = whole log) where both x and y are
 * present, thinned to an evenly spaced `maxPoints` sample when there are more.
 */
export function scatterPoints(
  log: Log,
  cfg: ScatterConfig,
  scope: XRange | null,
  maxPoints = 200_000,
): ScatterPoints {
  if (!cfg.x || !cfg.y) return { error: 'Choose an X and a Y channel' };
  const xc = resolve(log, cfg.x);
  if (typeof xc === 'string') return { error: xc };
  const yc = resolve(log, cfg.y);
  if (typeof yc === 'string') return { error: yc };
  let cc: Plottable | null = null;
  if (cfg.color) {
    const c = resolve(log, cfg.color);
    if (typeof c === 'string') return { error: c };
    cc = c;
  }
  const xs = xc.values;
  const ys = yc.values;
  const cs = cc?.values ?? null;
  const labels = { x: xc.header, y: yc.header, color: cc?.header ?? null };

  const { time } = log;
  const rows: number[] = [];
  for (let i = 0; i < log.rowCount; i++) {
    if (scope && (time[i] < scope.min || time[i] > scope.max)) continue;
    if (xs[i] !== xs[i] || ys[i] !== ys[i]) continue;
    rows.push(i);
  }
  if (rows.length === 0) return { error: 'No points to show' };

  const shown = Math.min(rows.length, maxPoints);
  const step = rows.length / shown;
  const x = new Float64Array(shown);
  const y = new Float64Array(shown);
  const t = new Float64Array(shown);
  const c = cs ? new Float64Array(shown) : null;
  for (let k = 0; k < shown; k++) {
    const i = rows[Math.floor(k * step)];
    x[k] = xs[i];
    y[k] = ys[i];
    t[k] = time[i];
    if (c && cs) c[k] = cs[i];
  }
  return { x, y, c, t, labels, total: rows.length, shown };
}

/** First two plottable, non-time channels — a sensible scatter to start from. */
export function defaultScatter(log: Log): ScatterConfig | null {
  const timeId = log.timeSource.kind === 'column' ? log.timeSource.channelId : null;
  const candidates = log.channels.filter((c) => c.values && c.id !== timeId);
  return candidates.length >= 2 ? { x: candidates[0].header, y: candidates[1].header } : null;
}
