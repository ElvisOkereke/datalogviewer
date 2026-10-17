import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT } from '@/state/layout';
import { useLayoutStore } from '@/state/layoutStore';

const log = parseCsvText('Time (s),RPM,MAP (kPa),AFR\n0,800,30,14.7\n0.05,810,31,14.6', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const layout = () => useLayoutStore.getState();

beforeEach(() => {
  localStorage.clear();
  useLayoutStore.setState({ ...EMPTY_LAYOUT });
});
afterEach(() => vi.restoreAllMocks());

test('ensureLayoutFor applies the default only to an empty layout', () => {
  layout().ensureLayoutFor(log);
  expect(layout().panes).toHaveLength(2);
  const first = layout().panes[0];
  layout().removeSeries(first.id, 'RPM');
  layout().ensureLayoutFor(log);
  expect(layout().panes[0].series.map((s) => s.header)).toEqual(['MAP (kPa)']);
});

test('resetLayout reapplies the default', () => {
  layout().ensureLayoutFor(log);
  layout().removePane(layout().panes[0].id);
  layout().resetLayout(log);
  expect(layout().panes).toHaveLength(2);
});

test('addSeries ignores duplicates and picks the next free colour', () => {
  const id = layout().addPane();
  layout().addSeries(id, 'RPM');
  layout().addSeries(id, 'RPM');
  layout().addSeries(id, 'AFR');
  expect(layout().panes[0].series).toEqual([
    { header: 'RPM', color: 's1' },
    { header: 'AFR', color: 's2' },
  ]);
});

test('addPane splits sizes evenly and returns the new id', () => {
  const a = layout().addPane();
  const b = layout().addPane();
  expect(layout().panes.map((p) => [p.id, p.size])).toEqual([
    [a, 50],
    [b, 50],
  ]);
});

describe('removing panes', () => {
  test('removing the only pane leaves an empty, usable layout', () => {
    const id = layout().addPane();
    layout().removePane(id);
    expect(layout().panes).toEqual([]);
    layout().addPane();
    expect(layout().panes).toHaveLength(1);
  });
});

test('series settings: colour, scale, shared axis', () => {
  const id = layout().addPane();
  layout().addSeries(id, 'RPM');
  layout().setSeriesColor(id, 'RPM', '#123456');
  layout().setSeriesScale(id, 'RPM', { min: 0, max: 7000 });
  layout().toggleSharedAxis(id);
  expect(layout().panes[0]).toMatchObject({
    sharedAxis: true,
    series: [{ header: 'RPM', color: '#123456', scale: { min: 0, max: 7000 } }],
  });
  layout().setSeriesScale(id, 'RPM', undefined);
  expect(layout().panes[0].series[0].scale).toBeUndefined();
});

test('setPaneSizes, view, inspector and sidebar width', () => {
  const a = layout().addPane();
  const b = layout().addPane();
  layout().setPaneSizes({ [a]: 70, [b]: 30 });
  layout().setView('table');
  layout().setInspectorOpen(true);
  layout().setSidebarWidth(300);
  expect(layout()).toMatchObject({ view: 'table', inspectorOpen: true, sidebarWidth: 300 });
  expect(layout().panes.map((p) => p.size)).toEqual([70, 30]);
});

test('persists under dlv.layout.v1', () => {
  layout().addPane();
  const raw = localStorage.getItem('dlv.layout.v1');
  expect(raw).toContain('"version":1');
  expect(raw).toContain('"panes"');
});

test('blocked storage never breaks an action', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  expect(() => layout().addPane()).not.toThrow();
  expect(layout().panes).toHaveLength(1);
});

test('a new series takes a colour not used in any pane (colour follows the channel)', () => {
  const a = layout().addPane();
  const b = layout().addPane();
  layout().addSeries(a, 'RPM');
  layout().addSeries(b, 'AFR');
  expect(layout().panes.map((p) => p.series[0].color)).toEqual(['s1', 's2']);
});
