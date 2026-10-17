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
  test('two panes: first two numeric channels, then the third; time and text excluded', () => {
    const layout = defaultLayout(demo);
    expect(layout.version).toBe(1);
    expect(layout.panes.map((p) => p.series.map((s) => [s.header, s.color]))).toEqual([
      [
        ['RPM', 's1'],
        ['MAP (kPa)', 's2'],
      ],
      [['AFR', 's1']],
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
