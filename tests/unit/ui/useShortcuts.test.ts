import { expect, test } from 'vitest';
import { isShortcutBlocked } from '@/ui/useShortcuts';

const inside = (html: string, selector: string) => {
  document.body.innerHTML = html;
  return document.querySelector(selector);
};

test('typing fields, menus, dialogs and button groups keep their own keys', () => {
  expect(isShortcutBlocked(inside('<input id="t">', '#t'), false)).toBe(true);
  expect(
    isShortcutBlocked(
      inside('<div role="menu"><div id="t" role="menuitem"></div></div>', '#t'),
      false,
    ),
  ).toBe(true);
  expect(
    isShortcutBlocked(inside('<div role="dialog"><button id="t"></button></div>', '#t'), false),
  ).toBe(true);
  expect(
    isShortcutBlocked(inside('<div role="group"><button id="t"></button></div>', '#t'), false),
  ).toBe(true);
});

test('an event another handler already used is ignored', () => {
  expect(isShortcutBlocked(inside('<div id="t"></div>', '#t'), true)).toBe(true);
});

test('the page itself gets shortcuts', () => {
  expect(isShortcutBlocked(document.body, false)).toBe(false);
  expect(isShortcutBlocked(inside('<main><div id="t"></div></main>', '#t'), false)).toBe(false);
});
