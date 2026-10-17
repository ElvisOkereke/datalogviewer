// @vitest-environment node
import { expect, test } from 'vitest';
import { pngLayout } from '@/charts/exportPng';

test('stacks each pane under its legend row, with gaps between panes', () => {
  expect(
    pngLayout(
      [
        { width: 800, height: 200 },
        { width: 780, height: 100 },
      ],
      20,
      8,
    ),
  ).toEqual({ width: 800, height: 348, offsets: [0, 228] });
});

test('no panes → an empty image', () => {
  expect(pngLayout([], 20, 8)).toEqual({ width: 0, height: 0, offsets: [] });
});
