import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { EMPTY_LAYOUT, migrateLayout } from '@/state/layout';
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

test('persists under dlv.layout.v2', () => {
  layout().addPane();
  const raw = localStorage.getItem('dlv.layout.v2');
  expect(raw).toContain('"version":2');
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

describe('v2 actions', () => {
  test('calculated definitions are clamped so the saved layout always loads back', () => {
    const id = layout().addCalculated({
      name: 'n'.repeat(150),
      unit: 'u'.repeat(150),
      expression: 'x'.repeat(3000),
    });
    expect(layout().calculated[0]).toMatchObject({
      name: 'n'.repeat(100),
      unit: 'u'.repeat(100),
      expression: 'x'.repeat(2000),
    });
    layout().updateCalculated(id, { name: 'm'.repeat(150) });
    expect(layout().calculated[0].name).toBe('m'.repeat(100));
    expect(migrateLayout(JSON.parse(JSON.stringify(layout()))).calculated).toHaveLength(1);
  });

  test('calculated channel definitions can be added, updated and removed', () => {
    const id = layout().addCalculated({ name: 'Lambda', expression: '[AFR] / 14.7' });
    expect(layout().calculated).toEqual([{ id, name: 'Lambda', expression: '[AFR] / 14.7' }]);
    layout().updateCalculated(id, { unit: 'λ', expression: '[AFR]/14.68' });
    expect(layout().calculated[0]).toMatchObject({ unit: 'λ', expression: '[AFR]/14.68' });
    layout().removeCalculated(id);
    expect(layout().calculated).toEqual([]);
  });

  test('inspector tab, scatter config and view', () => {
    layout().setInspectorTab('markers');
    layout().setScatter({ x: 'RPM', y: 'AFR' });
    layout().setView('scatter');
    expect(layout()).toMatchObject({
      inspectorTab: 'markers',
      scatter: { x: 'RPM', y: 'AFR' },
      view: 'scatter',
    });
  });

  test('replaceLayout swaps the whole layout', () => {
    layout().addPane();
    layout().replaceLayout({ ...EMPTY_LAYOUT, sidebarWidth: 300 });
    expect(layout()).toMatchObject({ panes: [], sidebarWidth: 300 });
  });

  test('a saved v1 layout is picked up and upgraded on first run', async () => {
    localStorage.clear();
    localStorage.setItem(
      'dlv.layout.v1',
      JSON.stringify({
        state: {
          version: 1,
          panes: [{ id: 'old', size: 100, sharedAxis: false, series: [] }],
          sidebarWidth: 240,
          inspectorOpen: false,
          view: 'chart',
        },
        version: 1,
      }),
    );
    await useLayoutStore.persist.rehydrate();
    expect(layout()).toMatchObject({ version: 2, panes: [{ id: 'old' }], calculated: [] });
  });
});

describe('caps are enforced where layouts are built, so a saved layout always loads back', () => {
  test('no more than 32 panes', () => {
    for (let i = 0; i < 40; i++) layout().addPane();
    expect(layout().panes).toHaveLength(32);
  });

  test('no more than 32 series in a pane', () => {
    const id = layout().addPane();
    for (let i = 0; i < 40; i++) layout().addSeries(id, `C${i}`);
    expect(layout().panes[0].series).toHaveLength(32);
  });

  test('no more than 64 calculated channels', () => {
    for (let i = 0; i < 70; i++) layout().addCalculated({ name: `N${i}`, expression: '1' });
    expect(layout().calculated).toHaveLength(64);
  });

  test('a layout built at the caps survives a save and reload', async () => {
    for (let i = 0; i < 40; i++) layout().addPane();
    const saved = localStorage.getItem('dlv.layout.v2');
    useLayoutStore.setState({ ...EMPTY_LAYOUT });
    localStorage.setItem('dlv.layout.v2', saved!);
    await useLayoutStore.persist.rehydrate();
    expect(layout().panes).toHaveLength(32);
  });
});
