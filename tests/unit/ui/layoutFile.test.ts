import { expect, test } from 'vitest';
import { EMPTY_LAYOUT, type PersistedLayout } from '@/state/layout';
import { parseLayoutFile, serializeLayout } from '@/ui/layoutFile';

const layout: PersistedLayout = {
  ...EMPTY_LAYOUT,
  panes: [{ id: 'p1', size: 100, sharedAxis: false, series: [{ header: 'RPM', color: 's1' }] }],
  calculated: [{ id: 'k', name: 'Lambda', expression: '[AFR] / 14.7' }],
};

test('a saved layout file round-trips and is marked as ours', () => {
  const text = serializeLayout(layout);
  expect(JSON.parse(text)).toMatchObject({ app: 'DataLogViewer', kind: 'layout', version: 2 });
  expect(parseLayoutFile(text)).toEqual(layout);
});

test('a v1 layout file is upgraded', () => {
  const v1 = {
    app: 'DataLogViewer',
    kind: 'layout',
    version: 1,
    panes: layout.panes,
    sidebarWidth: 240,
    inspectorOpen: false,
    view: 'chart',
  };
  expect(parseLayoutFile(JSON.stringify(v1))).toMatchObject({ version: 2, panes: layout.panes });
});

test.each([
  ['not JSON', 'not json'],
  ['a JSON array', '[]'],
  ['JSON without our marker', JSON.stringify({ ...layout })],
  [
    'a future version',
    JSON.stringify({ app: 'DataLogViewer', kind: 'layout', ...layout, version: 3 }),
  ],
  ['a different kind', JSON.stringify({ app: 'DataLogViewer', kind: 'session', ...layout })],
])('rejects %s', (_label, text) => {
  expect(parseLayoutFile(text)).toBeNull();
});
