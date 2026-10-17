import { nearestIndex } from '@/data/timeIndex';
import type { XRange } from './range';

/** Below this many samples per pixel, uPlot draws the raw data comfortably. */
const RAW_SAMPLES_PER_PX = 4;
/** Decimated output: one min and one max per bucket, about two points per pixel. */
const POINTS_PER_PX = 2;

export type WindowPlan =
  { decimate: false } | { decimate: true; i0: number; i1: number; bucket: number };

/** Decides whether the visible part of a log needs decimating for a plot `widthPx` wide. */
export function planWindow(time: Float64Array, range: XRange, widthPx: number): WindowPlan {
  const n = time.length;
  const i0 = Math.max(0, nearestIndex(time, range.min) - 1);
  const i1 = Math.min(n, nearestIndex(time, range.max) + 2);
  const count = i1 - i0;
  const width = Math.max(1, Math.round(widthPx));
  if (count <= width * RAW_SAMPLES_PER_PX) return { decimate: false };
  return { decimate: true, i0, i1, bucket: Math.ceil(count / (width * POINTS_PER_PX)) };
}

/**
 * Reduces samples [i0, i1) to each bucket's minimum and maximum, in their original order, so every
 * spike stays visible at any zoom. All series share the bucket x positions (first and last time in
 * the bucket). A bucket with no finite values stays NaN (a gap).
 */
export function decimateMinMax(
  time: Float64Array,
  series: Float64Array[],
  i0: number,
  i1: number,
  bucket: number,
): { x: Float64Array; ys: Float64Array[] } {
  const buckets = Math.ceil((i1 - i0) / bucket);
  const x = new Float64Array(buckets * 2);
  const ys = series.map(() => new Float64Array(buckets * 2));

  for (let k = 0; k < buckets; k++) {
    const b0 = i0 + k * bucket;
    const b1 = Math.min(b0 + bucket, i1);
    x[2 * k] = time[b0];
    x[2 * k + 1] = time[b1 - 1];

    for (let s = 0; s < series.length; s++) {
      const v = series[s];
      let min = Infinity;
      let max = -Infinity;
      let minAt = -1;
      let maxAt = -1;
      for (let j = b0; j < b1; j++) {
        const y = v[j];
        if (y !== y) continue; // NaN
        if (y < min) {
          min = y;
          minAt = j;
        }
        if (y > max) {
          max = y;
          maxAt = j;
        }
      }
      const out = ys[s];
      if (minAt < 0) {
        out[2 * k] = NaN;
        out[2 * k + 1] = NaN;
      } else if (minAt <= maxAt) {
        out[2 * k] = min;
        out[2 * k + 1] = max;
      } else {
        out[2 * k] = max;
        out[2 * k + 1] = min;
      }
    }
  }
  return { x, ys };
}
