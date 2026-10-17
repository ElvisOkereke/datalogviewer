import { describe, expect, test } from 'vitest';
import { clampRange, minSpanFor, panRange, resizeRange, zoomRange } from '@/charts/range';

const B = { min: 0, max: 100 };

describe('zoomRange', () => {
  test('zooms in around the anchor', () => {
    expect(zoomRange({ min: 0, max: 100 }, 50, 0.5, B, 1)).toEqual({ min: 25, max: 75 });
  });
  test('an anchor at the edge stays put', () => {
    expect(zoomRange({ min: 0, max: 100 }, 0, 0.5, B, 1)).toEqual({ min: 0, max: 50 });
  });
  test('zooms out', () => {
    expect(zoomRange({ min: 40, max: 60 }, 50, 4, B, 1)).toEqual({ min: 10, max: 90 });
  });
  test('never goes past the bounds', () => {
    expect(zoomRange({ min: 0, max: 100 }, 50, 10, B, 1)).toEqual(B);
  });
  test('never zooms in past the minimum span', () => {
    expect(zoomRange({ min: 49, max: 51 }, 50, 0.01, B, 1)).toEqual({ min: 49.5, max: 50.5 });
  });
});

describe('panRange', () => {
  test('shifts and keeps the span', () => {
    expect(panRange({ min: 10, max: 20 }, 5, B)).toEqual({ min: 15, max: 25 });
  });
  test('stops at the bounds', () => {
    expect(panRange({ min: 90, max: 100 }, 5, B)).toEqual({ min: 90, max: 100 });
    expect(panRange({ min: 2, max: 12 }, -5, B)).toEqual({ min: 0, max: 10 });
  });
});

describe('resizeRange', () => {
  test('moves one edge', () => {
    expect(resizeRange({ min: 10, max: 20 }, 'max', 15, B, 1)).toEqual({ min: 10, max: 15 });
  });
  test('respects the minimum span', () => {
    expect(resizeRange({ min: 10, max: 20 }, 'min', 19.8, B, 1)).toEqual({ min: 19, max: 20 });
  });
  test('stays inside the bounds', () => {
    expect(resizeRange({ min: 10, max: 20 }, 'min', -50, B, 1)).toEqual({ min: 0, max: 20 });
  });
});

test('clampRange shifts a range back inside the bounds', () => {
  expect(clampRange({ min: -5, max: 5 }, B, 1)).toEqual({ min: 0, max: 10 });
  expect(clampRange({ min: -50, max: 500 }, B, 1)).toEqual(B);
});

test('minSpanFor is ten samples wide', () => {
  expect(minSpanFor(Float64Array.of(0, 0.05, 0.1))).toBeCloseTo(0.5);
  expect(minSpanFor(Float64Array.of(7))).toBe(1);
});
