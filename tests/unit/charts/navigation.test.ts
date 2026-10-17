import { expect, test } from 'vitest';
import { wheelZoomFactor } from '@/charts/navigation';

test('horizontal-only wheel events do not zoom', () => {
  expect(wheelZoomFactor(0, 0)).toBeNull();
});

test('a mouse-wheel notch zooms about 25%', () => {
  expect(wheelZoomFactor(100, 0)).toBeCloseTo(1.25, 1);
  expect(wheelZoomFactor(-100, 0)).toBeCloseTo(0.8, 1);
});

test('small trackpad deltas zoom gently', () => {
  const f = wheelZoomFactor(-4, 0)!;
  expect(f).toBeLessThan(1);
  expect(f).toBeGreaterThan(0.98);
});

test('huge deltas are clamped; line-based deltas are scaled to pixels', () => {
  expect(wheelZoomFactor(5000, 0)).toBeCloseTo(wheelZoomFactor(100, 0)!, 5);
  expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(99, 0)!, 2);
});
