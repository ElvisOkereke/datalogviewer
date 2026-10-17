import { expect, test } from 'vitest';
import { GrowableF64 } from '@/data/growable';

test('grows past its initial capacity and trims on toArray', () => {
  const g = new GrowableF64();
  for (let i = 0; i < 5000; i++) g.push(i);
  const a = g.toArray();
  expect(a.length).toBe(5000);
  expect(a[4999]).toBe(4999);
  expect(a.buffer.byteLength).toBe(5000 * 8);
});
