import { expect, test } from 'vitest';
import { filterByQuery, fuzzyScore } from '@/data/search';

test('empty query matches everything', () => {
  expect(fuzzyScore('', 'RPM')).toBe(0);
});

test('substring beats subsequence; earlier substring beats later', () => {
  const sub = fuzzyScore('map', 'Calculated MAP')!;
  const early = fuzzyScore('map', 'MAP (kPa)')!;
  const seq = fuzzyScore('cmp', 'Calculated MAP')!;
  expect(early).toBeGreaterThan(sub);
  expect(sub).toBeGreaterThan(seq);
});

test('returns null when letters are missing or out of order', () => {
  expect(fuzzyScore('xyz', 'RPM')).toBeNull();
  expect(fuzzyScore('mpr', 'RPM')).toBeNull();
});

test('filterByQuery drops non-matches and sorts by score', () => {
  const items = ['Coolant Temperature', 'Calculated MAP', 'MAP (kPa)', 'RPM'];
  expect(filterByQuery(items, 'map', (s) => s)).toEqual(['MAP (kPa)', 'Calculated MAP']);
  expect(filterByQuery(items, '', (s) => s)).toEqual(items);
});
