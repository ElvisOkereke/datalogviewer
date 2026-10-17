import { expect, test } from 'vitest';
import { nextSeriesColor, resolveSeriesColor, SERIES_SLOTS } from '@/charts/palette';

test('the validated eight-slot palettes', () => {
  expect(SERIES_SLOTS.dark).toEqual([
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ]);
  expect(SERIES_SLOTS.light).toEqual([
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#6250d6',
    '#e34948',
  ]);
});

test('nextSeriesColor takes the lowest unused slot', () => {
  expect(nextSeriesColor([])).toBe('s1');
  expect(nextSeriesColor(['s1', 's3'])).toBe('s2');
  expect(nextSeriesColor(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'])).toBe('s1');
  expect(nextSeriesColor(['#123456'])).toBe('s1');
});

test('resolveSeriesColor maps slots per theme and keeps custom colours', () => {
  expect(resolveSeriesColor('s1', 'dark')).toBe('#3987e5');
  expect(resolveSeriesColor('s1', 'light')).toBe('#2a78d6');
  expect(resolveSeriesColor('#123456', 'light')).toBe('#123456');
  expect(resolveSeriesColor('s99', 'dark')).toBe('#3987e5');
});
