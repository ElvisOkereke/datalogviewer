import { expect, test } from 'vitest';
import { nearestIndex } from '@/data/timeIndex';

const t = Float64Array.of(0, 1, 2, 3);

test('finds the nearest sample', () => {
  expect(nearestIndex(t, 1.4)).toBe(1);
  expect(nearestIndex(t, 1.6)).toBe(2);
});

test('ties go to the lower index', () => {
  expect(nearestIndex(t, 1.5)).toBe(1);
});

test('clamps outside the data', () => {
  expect(nearestIndex(t, -5)).toBe(0);
  expect(nearestIndex(t, 99)).toBe(3);
});

test('is fast on a million samples', () => {
  const big = new Float64Array(1_000_000).map((_, i) => i * 0.05);
  const start = performance.now();
  for (let k = 0; k < 1000; k++) nearestIndex(big, (k * 49_999) % 50_000);
  expect(performance.now() - start).toBeLessThan(50);
  expect(nearestIndex(big, 12_345.67)).toBe(246_913);
});
