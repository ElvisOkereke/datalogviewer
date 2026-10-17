export function finiteMinMax(values: ArrayLike<number>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min <= max ? { min, max } : { min: NaN, max: NaN };
}

/** First index whose time is ≥ t (or the length when none is). */
function lowerBound(time: Float64Array, t: number): number {
  let lo = 0;
  let hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index whose time is > t (or the length when none is). */
function upperBound(time: Float64Array, t: number): number {
  let lo = 0;
  let hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** `[i0, i1)`: the samples whose time lies within `[r.min, r.max]`. */
export function sampleSpan(time: Float64Array, r: { min: number; max: number }): [number, number] {
  return [lowerBound(time, r.min), upperBound(time, r.max)];
}

export interface RangeStats {
  min: number;
  max: number;
  mean: number;
  /** Population standard deviation. */
  std: number;
  count: number;
}

/**
 * Statistics over the finite values in `[i0, i1)`, in one pass. Sums are taken relative to the
 * first finite value (shifted sums), which keeps the variance accurate without a division per value.
 */
export function rangeStats(values: Float64Array, i0: number, i1: number): RangeStats {
  let min = Infinity;
  let max = -Infinity;
  let shift = NaN;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = i0; i < i1; i++) {
    const v = values[i];
    if (v !== v) continue;
    if (count === 0) shift = v;
    const d = v - shift;
    sum += d;
    sumSq += d * d;
    count++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (count === 0) return { min: NaN, max: NaN, mean: NaN, std: NaN, count: 0 };
  const meanShifted = sum / count;
  const variance = Math.max(0, sumSq / count - meanShifted * meanShifted);
  return { min, max, mean: shift + meanShifted, std: Math.sqrt(variance), count };
}
