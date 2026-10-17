/** A visible x-range in the log's time units (seconds or row index). */
export type XRange = { min: number; max: number };

/**
 * Keeps a range inside `bounds` and at least `minSpan` wide (or the whole bounds when they are
 * narrower), shifting rather than shrinking it whenever possible.
 */
export function clampRange(r: XRange, bounds: XRange, minSpan: number): XRange {
  const boundsSpan = bounds.max - bounds.min;
  const span = Math.max(r.max - r.min, Math.min(minSpan, boundsSpan));
  if (span >= boundsSpan) return { min: bounds.min, max: bounds.max };
  let min = r.max - r.min < span ? (r.min + r.max) / 2 - span / 2 : r.min;
  if (min < bounds.min) min = bounds.min;
  if (min + span > bounds.max) min = bounds.max - span;
  return { min, max: min + span };
}

/** Scales the span by `factor` (< 1 zooms in), keeping the value under `anchor` in place. */
export function zoomRange(
  r: XRange,
  anchor: number,
  factor: number,
  bounds: XRange,
  minSpan: number,
): XRange {
  const span = r.max - r.min;
  const boundsSpan = bounds.max - bounds.min;
  const next = Math.min(Math.max(span * factor, Math.min(minSpan, boundsSpan)), boundsSpan);
  const frac = span > 0 ? (anchor - r.min) / span : 0.5;
  const min = anchor - frac * next;
  return clampRange({ min, max: min + next }, bounds, minSpan);
}

export function panRange(r: XRange, delta: number, bounds: XRange): XRange {
  return clampRange({ min: r.min + delta, max: r.max + delta }, bounds, 0);
}

/** Moves one edge to `value`, never closer than `minSpan` to the other edge or past the bounds. */
export function resizeRange(
  r: XRange,
  edge: 'min' | 'max',
  value: number,
  bounds: XRange,
  minSpan: number,
): XRange {
  if (edge === 'max') {
    const max = Math.min(Math.max(value, r.min + minSpan), bounds.max);
    return { min: Math.min(r.min, max - minSpan), max };
  }
  const min = Math.max(Math.min(value, r.max - minSpan), bounds.min);
  return { min, max: Math.max(r.max, min + minSpan) };
}

/** The narrowest useful view: about ten samples. */
export function minSpanFor(time: Float64Array): number {
  const n = time.length;
  if (n < 2) return 1;
  const span = (10 * (time[n - 1] - time[0])) / (n - 1);
  return span > 0 ? span : 1;
}
