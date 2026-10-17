import { describe, expect, test } from 'vitest';
import { shortcutFor } from '@/ui/shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('shortcutFor', () => {
  test.each([
    [key('ArrowRight'), { type: 'step', delta: 1 }],
    [key('ArrowRight', { shiftKey: true }), { type: 'step', delta: 10 }],
    [key('ArrowLeft'), { type: 'step', delta: -1 }],
    [key('ArrowLeft', { shiftKey: true }), { type: 'step', delta: -10 }],
    [key('Home'), { type: 'home' }],
    [key('End'), { type: 'end' }],
    [key('+', { shiftKey: true }), { type: 'zoom', factor: 0.8 }],
    [key('='), { type: 'zoom', factor: 0.8 }],
    [key('-'), { type: 'zoom', factor: 1.25 }],
    [key('f'), { type: 'fit' }],
    [key('F', { shiftKey: true }), { type: 'fit' }],
    [key('Escape'), { type: 'unpin' }],
    [key('?', { shiftKey: true }), { type: 'help' }],
  ])('%j → %j', (event, action) => {
    expect(shortcutFor(event, false)).toEqual(action);
  });

  test('ignored while typing in a field', () => {
    expect(shortcutFor(key('ArrowRight'), true)).toBeNull();
    expect(shortcutFor(key('f'), true)).toBeNull();
  });

  test('ignored with Ctrl, Cmd or Alt held, so browser shortcuts keep working', () => {
    expect(shortcutFor(key('f', { ctrlKey: true }), false)).toBeNull();
    expect(shortcutFor(key('-', { metaKey: true }), false)).toBeNull();
    expect(shortcutFor(key('ArrowLeft', { altKey: true }), false)).toBeNull();
  });

  test('unrelated keys do nothing', () => {
    expect(shortcutFor(key('a'), false)).toBeNull();
  });
});
