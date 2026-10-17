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
    [
      'an over-long unit',
      {
        ...EMPTY_LAYOUT,
        calculated: [{ id: 'k', name: 'X', unit: 'u'.repeat(101), expression: '1' }],
      },
    ],
    ['a bad scatter config', { ...EMPTY_LAYOUT, scatter: { x: 1 } }],
    ['an over-long scatter channel', { ...EMPTY_LAYOUT, scatter: { x: 'x'.repeat(1001), y: 'y' } }],
    [
      'an over-long series channel',
      {
        ...EMPTY_LAYOUT,
        panes: [
          {
            id: 'p',
            size: 1,
            sharedAxis: false,
            series: [{ header: 'h'.repeat(1001), color: 's1' }],
          },
        ],
      },
    ],
    ['an unknown view', { ...EMPTY_LAYOUT, view: 'map' }],
    ['an unknown inspector tab', { ...EMPTY_LAYOUT, inspectorTab: 'nope' }],
  ])('rejects %s', (_label, raw) => {
    expect(migrateLayout(raw)).toEqual(EMPTY_LAYOUT);
  });
});

describe('layout files cannot make the app unusable', () => {
  test('the sidebar width is clamped to a usable range', () => {
    expect(migrateLayout({ ...EMPTY_LAYOUT, sidebarWidth: 50000 }).sidebarWidth).toBe(480);
    expect(migrateLayout({ ...EMPTY_LAYOUT, sidebarWidth: 3 }).sidebarWidth).toBe(160);
    expect(migrateLayout({ ...EMPTY_LAYOUT, sidebarWidth: 300 }).sidebarWidth).toBe(300);
  });

  test.each([
    [
      'an over-complex formula',
      {
        ...EMPTY_LAYOUT,
        calculated: [{ id: 'k', name: 'X', expression: Array(200).fill('[A]').join('+') }],
      },
    ],
    [
      'duplicate calculated ids',
      {
        ...EMPTY_LAYOUT,
        calculated: [
          { id: 'k', name: 'X', expression: '1' },
          { id: 'k', name: 'Y', expression: '2' },
        ],
      },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(migrateLayout(raw)).toEqual(EMPTY_LAYOUT);
  });

  test('a formula with a syntax error is still kept (shown as unavailable)', () => {
    const raw = { ...EMPTY_LAYOUT, calculated: [{ id: 'k', name: 'X', expression: '[A] +' }] };
    expect(migrateLayout(raw).calculated).toHaveLength(1);
  });
});

describe('size caps (layouts can come from files)', () => {
  const pane = (i: number, series = 1) => ({
    id: `p${i}`,
    size: 1,
    sharedAxis: false,
    series: Array.from({ length: series }, (_, k) => ({ header: `C${k}`, color: 's1' })),
  });
  test.each([
    ['33 panes', { ...EMPTY_LAYOUT, panes: Array.from({ length: 33 }, (_, i) => pane(i)) }],
    ['33 series in a pane', { ...EMPTY_LAYOUT, panes: [pane(0, 33)] }],
    [
      '65 calculated channels',
      {
        ...EMPTY_LAYOUT,
        calculated: Array.from({ length: 65 }, (_, i) => ({
          id: `k${i}`,
          name: `N${i}`,
          expression: '1',
        })),
      },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(migrateLayout(raw)).toEqual(EMPTY_LAYOUT);
  });

  test('accepts layouts at the caps', () => {
    const atCaps = { ...EMPTY_LAYOUT, panes: Array.from({ length: 32 }, (_, i) => pane(i, 32)) };
    expect(migrateLayout(atCaps).panes).toHaveLength(32);
  });
});
