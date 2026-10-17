import { expect, test } from 'vitest';
import { finiteMinMax } from '@/data/stats';

test('ignores NaN and infinities', () => {
  expect(finiteMinMax(Float64Array.of(NaN, 3, -2, Infinity, 7))).toEqual({ min: -2, max: 7 });
});

test('returns NaN bounds when nothing is finite', () => {
  const r = finiteMinMax(Float64Array.of(NaN, NaN));
  expect(r.min).toBeNaN();
  expect(r.max).toBeNaN();
});
