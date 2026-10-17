import { expect, test } from 'vitest';
import { cn } from '@/lib/utils';

test('cn merges conflicting Tailwind classes, last wins', () => {
  expect(cn('px-2', false, 'px-4')).toBe('px-4');
});

test('cn drops falsy values', () => {
  expect(cn('a', undefined, 'b')).toBe('a b');
});
