import { beforeEach, describe, expect, test } from 'vitest';
import { useViewStore } from '@/state/viewStore';

const view = () => useViewStore.getState();
const time5 = Float64Array.of(0, 1, 2, 3, 4);
// 401 samples over 40 s: the minimum zoom span (10 samples) is 1 s.
const time40 = Float64Array.from({ length: 401 }, (_, i) => i / 10);

beforeEach(() => view().resetForLog(time5));

test('resetForLog shows the whole log with no cursor', () => {
  expect(view()).toMatchObject({
    range: null,
    bounds: { min: 0, max: 4 },
    cursor: null,
    pinned: false,
  });
});

test('loading another log clears zoom and a pinned cursor', () => {
  view().resetForLog(time40);
  view().zoomAt(20, 0.5);
  expect(view().range).not.toBeNull();
  view().pin(3);
  view().resetForLog(Float64Array.of(0, 1));
  expect(view()).toMatchObject({
    range: null,
    cursor: null,
    pinned: false,
    bounds: { min: 0, max: 1 },
  });
});

test('zoomAt narrows the range and fit restores the whole log', () => {
  view().resetForLog(time40);
  view().zoomAt(20, 0.5);
  expect(view().range).toEqual({ min: 10, max: 30 });
  view().fit();
  expect(view().range).toBeNull();
});

test('zooming out to the bounds stores null', () => {
  view().resetForLog(time40);
  view().zoomAt(20, 0.5);
  view().zoomAt(20, 10);
  expect(view().range).toBeNull();
});

test('pan moves a zoomed range', () => {
  view().resetForLog(time40);
  view().zoomAt(20, 0.5);
  view().pan(5);
  expect(view().range).toEqual({ min: 15, max: 35 });
});

test('hover does not move a pinned cursor', () => {
  view().pin(1);
  view().setCursor(2);
  expect(view().cursor).toBe(1);
  view().unpin();
  view().setCursor(2);
  expect(view()).toMatchObject({ cursor: 2, pinned: false });
});

test('stepCursor starts at the first visible sample, pins, and clamps', () => {
  view().stepCursor(1, 5);
  expect(view()).toMatchObject({ cursor: 1, pinned: true });
  view().stepCursor(10, 5);
  expect(view().cursor).toBe(4);
  view().stepCursor(-10, 5);
  expect(view().cursor).toBe(0);
});

test('focusPane records the focused pane', () => {
  view().focusPane('p2');
  expect(view().focusedPaneId).toBe('p2');
});

describe('range selection', () => {
  test('select, zoom to it, clear', () => {
    view().resetForLog(time40);
    view().select({ min: 10, max: 20 });
    expect(view().selection).toEqual({ min: 10, max: 20 });
    expect(view().range).toBeNull();
    view().zoomToSelection();
    expect(view().range).toEqual({ min: 10, max: 20 });
    view().clearSelection();
    expect(view().selection).toBeNull();
  });

  test('a selection is clamped to the log and ignored if narrower than the minimum span', () => {
    view().resetForLog(time40);
    view().select({ min: -5, max: 5 });
    expect(view().selection).toEqual({ min: 0, max: 5 });
    view().select({ min: 7, max: 7.2 });
    expect(view().selection).toEqual({ min: 0, max: 5 });
  });

  test('loading another log clears the selection', () => {
    view().resetForLog(time40);
    view().select({ min: 10, max: 20 });
    view().resetForLog(time5);
    expect(view().selection).toBeNull();
  });
});
