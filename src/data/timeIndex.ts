/** Index of the sample nearest to `t` in a non-decreasing time array; ties go to the lower index. */
export function nearestIndex(time: Float64Array, t: number): number {
  const n = time.length;
  if (n === 0 || t <= time[0]) return 0;
  if (t >= time[n - 1]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return t - time[lo - 1] <= time[lo] - t ? lo - 1 : lo;
}
