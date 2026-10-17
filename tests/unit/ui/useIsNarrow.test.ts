import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useIsNarrow } from '@/ui/useIsNarrow';

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function mockMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn((query: string) => {
    expect(query).toBe('(max-width: 899px)');
    return mq as unknown as MediaQueryList;
  });
  return {
    set(matches: boolean) {
      mq.matches = matches;
      listeners.forEach((fn) => fn());
    },
  };
}

test('reports the current width class and follows changes', () => {
  const media = mockMedia(true);
  const { result } = renderHook(() => useIsNarrow());
  expect(result.current).toBe(true);
  act(() => media.set(false));
  expect(result.current).toBe(false);
});
