// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import {
  bindLayout,
  defaultLayout,
  EMPTY_LAYOUT,
  migrateLayout,
  type PersistedLayout,
} from '@/state/layout';

const logOf = (csv: string) => parseCsvText(csv, { fileName: 't.csv', encoding: 'utf-8' });
const demo = logOf('Time (s),RPM,MAP (kPa),AFR,Mode\n0,800,30,14.7,Idle\n0.05,810,31,14.6,Idle');

describe('defaultLayout', () => {
  test('two panes: first two numeric channels, then the third; colours unique across panes', () => {
    const layout = defaultLayout(demo);
    expect(layout.version).toBe(2);
    expect(layout.panes.map((p) => p.series.map((s) => [s.header, s.color]))).toEqual([
      [
        ['RPM', 's1'],
        ['MAP (kPa)', 's2'],
      ],
      [['AFR', 's3']],
    ]);
    expect(layout.panes.map((p) => p.size)).toEqual([50, 50]);
    expect(new Set(layout.panes.map((p) => p.id)).size).toBe(2);
  });

  test('a single numeric channel gives a single pane', () => {
    const layout = defaultLayout(logOf('Time (s),RPM\n0,800\n1,810'));
    expect(layout.panes).toHaveLength(1);
    expect(layout.panes[0].series.map((s) => s.header)).toEqual(['RPM']);
  });
});

test('bindLayout binds by header, then by name, and marks missing channels', () => {
  const layout: PersistedLayout = {
    ...EMPTY_LAYOUT,
    panes: [
      {
        id: 'p1',
        size: 100,
        sharedAxis: false,
        series: [
          { header: 'RPM', color: 's1' },
          { header: 'map (psi)', color: 's2' },
          { header: 'Boost (psi)', color: 's3' },
        ],
      },
    ],
  };
  const [pane] = bindLayout(layout, demo);
  expect(pane.series.map((s) => s.channel?.header ?? null)).toEqual(['RPM', 'MAP (kPa)', null]);
});

describe('migrateLayout', () => {
  test.each([null, 'junk', 42, { version: 2, panes: [] }, { version: 1, panes: 'x' }])(
    'falls back to the empty layout for %j',
    (raw) => {
      expect(migrateLayout(raw)).toEqual(EMPTY_LAYOUT);
    },
  );

  test('a valid layout round-trips', () => {
    const layout = defaultLayout(demo);
    expect(migrateLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });

  test('a pane with a malformed series is rejected as a whole', () => {
    const layout = defaultLayout(demo);
    const broken = JSON.parse(JSON.stringify(layout));
    broken.panes[0].series[0].header = 7;
    expect(migrateLayout(broken)).toEqual(EMPTY_LAYOUT);
  });
});

test('a saved series colour that is not a slot or hex rejects the layout', () => {
  const layout = defaultLayout(demo);
  const broken = JSON.parse(JSON.stringify(layout));
  broken.panes[0].series[0].color = 'red; background: url(https://example.com)';
  expect(migrateLayout(broken)).toEqual(EMPTY_LAYOUT);
});

describe('schema v2', () => {
  const v1 = {
    version: 1,
    panes: [{ id: 'p1', size: 100, sharedAxis: false, series: [{ header: 'RPM', color: 's1' }] }],
    sidebarWidth: 240,
    inspectorOpen: true,
    view: 'table',
  };

  test('a v1 layout is upgraded', () => {
    expect(migrateLayout(v1)).toEqual({
      ...v1,
      version: 2,
      inspectorTab: 'cursor',
      calculated: [],
      scatter: null,
    });
  });

  test('a v2 layout with calculated channels and a scatter config round-trips', () => {
    const v2 = {
      ...EMPTY_LAYOUT,
      view: 'scatter',
      inspectorTab: 'range',
      calculated: [{ id: 'k1', name: 'Lambda', unit: 'λ', expression: '[AFR] / 14.7' }],
      scatter: { x: 'RPM', y: 'AFR', color: 'MAP (kPa)' },
    };
    expect(migrateLayout(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  });

  test.each([
    ['duplicate pane ids', { ...v1, panes: [v1.panes[0], v1.panes[0]] }],
    ['an infinite pane size', { ...v1, panes: [{ ...v1.panes[0], size: Infinity }] }],
    ['a zero pane size', { ...v1, panes: [{ ...v1.panes[0], size: 0 }] }],
    [
      'an over-long expression',
      { ...EMPTY_LAYOUT, calculated: [{ id: 'k', name: 'X', expression: 'a'.repeat(2001) }] },
    ],
    [
      'an over-long name',
      { ...EMPTY_LAYOUT, calculated: [{ id: 'k', name: 'n'.repeat(101), expression: '1' }] },
    ],
    ['a bad scatter config', { ...EMPTY_LAYOUT, scatter: { x: 1 } }],
    ['an unknown view', { ...EMPTY_LAYOUT, view: 'map' }],
    ['an unknown inspector tab', { ...EMPTY_LAYOUT, inspectorTab: 'nope' }],
  ])('rejects %s', (_label, raw) => {
    expect(migrateLayout(raw)).toEqual(EMPTY_LAYOUT);
  });
});
