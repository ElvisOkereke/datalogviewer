import { expect, test } from 'vitest';
import { parseNumber } from '@/io/csv/number';

test.each([
  ['12.5', '.', 12.5],
  [' -3 ', '.', -3],
  ['1e3', '.', 1000],
  ['.5', '.', 0.5],
  ['12,5', ',', 12.5],
  ['812', ',', 812],
] as const)('%s with %s decimal → %d', (cell, decimal, expected) => {
  expect(parseNumber(cell, decimal)).toBe(expected);
});

test.each(['', '   ', 'abc', '12abc', 'Closed Loop', '1,234', 'Infinity'])('%j is NaN', (cell) => {
  expect(parseNumber(cell, '.')).toBeNaN();
});
