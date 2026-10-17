import { expect, test } from 'vitest';
import { bandRect } from '@/charts/overlays';

// x values 0..100 map onto a plot from 50 px to 450 px.
const toPx = (v: number) => 50 + v * 4;

test('a selection inside the view maps to its pixel band', () => {
  expect(bandRect({ min: 10, max: 20 }, toPx, 50, 400)).toEqual({ left: 90, width: 40 });
});

test('a selection running past the plot is clipped to it', () => {
  expect(bandRect({ min: -20, max: 20 }, toPx, 50, 400)).toEqual({ left: 50, width: 80 });
  expect(bandRect({ min: 90, max: 200 }, toPx, 50, 400)).toEqual({ left: 410, width: 40 });
});

test('a selection entirely outside the plot draws nothing', () => {
  expect(bandRect({ min: 150, max: 200 }, toPx, 50, 400)).toBeNull();
});
