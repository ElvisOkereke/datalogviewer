// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { decimateMinMax, planWindow } from '@/charts/decimate';

const t = (n: number) => Float64Array.from({ length: n }, (_, i) => i);

describe('decimateMinMax', () => {
  test('keeps each bucket’s min and max in their original order, so spikes survive', () => {
    const values = Float64Array.of(0, 0, 10, 0, 0, -5);
    const { x, ys } = decimateMinMax(t(6), [values], 0, 6, 3);
    expect(Array.from(x)).toEqual([0, 2, 3, 5]);
    expect(Array.from(ys[0])).toEqual([0, 10, 0, -5]);
  });

  test('a max before a min is emitted max first', () => {
    const { ys } = decimateMinMax(t(4), [Float64Array.of(9, 1, 1, 1)], 0, 4, 4);
    expect(Array.from(ys[0])).toEqual([9, 1]);
  });

  test('an all-NaN bucket stays a gap; NaN never wins min/max', () => {
    const values = Float64Array.of(NaN, NaN, 3, NaN);
    const { ys } = decimateMinMax(t(4), [values], 0, 4, 2);
    expect(Array.from(ys[0])).toEqual([NaN, NaN, 3, 3]);
  });

  test('several series share the same x buckets', () => {
    const a = Float64Array.of(1, 2, 3, 4);
    const b = Float64Array.of(8, 7, 6, 5);
    const { x, ys } = decimateMinMax(t(4), [a, b], 0, 4, 2);
    expect(x.length).toBe(4);
    expect(ys.map((y) => Array.from(y))).toEqual([
      [1, 2, 3, 4],
      [8, 7, 6, 5],
    ]);
  });

  test('a partial last bucket is handled', () => {
    const { x } = decimateMinMax(t(5), [Float64Array.of(1, 2, 3, 4, 5)], 0, 5, 2);
    expect(Array.from(x)).toEqual([0, 1, 2, 3, 4, 4]);
  });
});

describe('planWindow', () => {
  test('few visible samples: plot the full arrays untouched', () => {
    const time = t(1000);
    const plan = planWindow(time, { min: 0, max: 999 }, 800);
    expect(plan).toEqual({ decimate: false });
  });

  test('many visible samples: decimate just the visible window, about two points per pixel', () => {
    const time = t(1_000_000);
    const plan = planWindow(time, { min: 250_000, max: 750_000 }, 1000);
    expect(plan).toMatchObject({ decimate: true });
    if (!plan.decimate) throw new Error('unreachable');
    expect(plan.i0).toBeLessThanOrEqual(250_000);
    expect(plan.i1).toBeGreaterThanOrEqual(750_001);
    expect(plan.bucket).toBe(Math.ceil((plan.i1 - plan.i0) / 2000));
  });
});

test('decimating a million samples is fast', () => {
  const n = 1_000_000;
  const time = t(n);
  const values = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 500));
  const start = performance.now();
  for (let k = 0; k < 4; k++) decimateMinMax(time, [values], 0, n, 500);
  expect((performance.now() - start) / 4).toBeLessThan(25);
});
