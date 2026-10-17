import { describe, expect, test } from 'vitest';
import { finiteMinMax, rangeStats, sampleSpan } from '@/data/stats';

test('ignores NaN and infinities', () => {
  expect(finiteMinMax(Float64Array.of(NaN, 3, -2, Infinity, 7))).toEqual({ min: -2, max: 7 });
});

test('returns NaN bounds when nothing is finite', () => {
  const r = finiteMinMax(Float64Array.of(NaN, NaN));
  expect(r.min).toBeNaN();
  expect(r.max).toBeNaN();
});

describe('range statistics', () => {
  test('sampleSpan finds the samples inside a time range', () => {
    const t = Float64Array.from({ length: 10 }, (_, i) => i);
    expect(sampleSpan(t, { min: 2.5, max: 6 })).toEqual([3, 7]);
    expect(sampleSpan(t, { min: -5, max: 100 })).toEqual([0, 10]);
    expect(sampleSpan(t, { min: 3.2, max: 3.8 })).toEqual([4, 4]);
  });

  test('rangeStats ignores NaN and uses the population standard deviation', () => {
    const r = rangeStats(Float64Array.of(1, 2, NaN, 3), 0, 4);
    expect(r).toMatchObject({ min: 1, max: 3, mean: 2, count: 3 });
    expect(r.std).toBeCloseTo(Math.sqrt(2 / 3));
  });

  test('an empty or all-NaN range has no statistics', () => {
    const r = rangeStats(Float64Array.of(NaN, NaN), 0, 2);
    expect(r.count).toBe(0);
    expect(r.mean).toBeNaN();
    expect(rangeStats(Float64Array.of(1), 1, 1).count).toBe(0);
  });

  test('20 channels × 500k rows stay well inside a frame budget', () => {
    const cols = Array.from({ length: 20 }, (_, k) =>
      Float64Array.from({ length: 500_000 }, (_, i) => (i * (k + 1)) % 997),
    );
    // Best of three, so a busy test machine doesn't make this flaky.
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      for (const c of cols) rangeStats(c, 0, c.length);
      best = Math.min(best, performance.now() - start);
    }
    // Shared CI runners run test files side by side on few cores; allow them 2x.
    expect(best).toBeLessThan(process.env.CI ? 300 : 150);
  });
});
