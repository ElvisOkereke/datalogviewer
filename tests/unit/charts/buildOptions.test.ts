// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  buildPaneOptions,
  formatTime,
  formatValue,
  seriesRange,
  toPlotValues,
} from '@/charts/buildOptions';
import type { ChartTheme } from '@/charts/chartTheme';
import { resolveSeriesColor } from '@/charts/palette';
import type { Channel } from '@/data/types';
import { parseCsvText } from '@/io/csv/parseCsv';
import { bindLayout, EMPTY_LAYOUT, type BoundPane } from '@/state/layout';

const theme: ChartTheme = {
  mode: 'dark',
  text: '#e7ebef',
  muted: '#7d8792',
  grid: '#1c2026',
  border: '#252a31',
  cursor: '#f5a524',
  font: 'Inter Variable',
  monoFont: 'JetBrains Mono Variable',
};
const log = parseCsvText('Time (s),RPM,AFR\n0,0,14\n0.05,50,15\n0.1,100,16', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const channel = (name: string) => log.channels.find((c) => c.name === name)!;
const fakeChannel = (values: number[]): Channel => {
  const v = Float64Array.from(values);
  const finite = values.filter(Number.isFinite);
  return {
    id: 'x',
    header: 'X',
    name: 'X',
    kind: 'numeric',
    values: v,
    text: null,
    min: finite.length ? Math.min(...finite) : NaN,
    max: finite.length ? Math.max(...finite) : NaN,
  };
};
const pane = (headers: string[], sharedAxis = false): BoundPane =>
  bindLayout(
    {
      ...EMPTY_LAYOUT,
      panes: [
        {
          id: 'p1',
          size: 100,
          sharedAxis,
          series: headers.map((header, i) => ({ header, color: `s${i + 1}` })),
        },
      ],
    },
    log,
  )[0];
const build = (p: BoundPane, axisHeader: string | null = null) =>
  buildPaneOptions({ pane: p, log, theme, width: 800, height: 200, axisHeader });

describe('toPlotValues', () => {
  test('passes NaN-free arrays through untouched', () => {
    const a = Float64Array.of(1, 2);
    expect(toPlotValues(a)).toBe(a);
  });
  test('turns NaN into null so uPlot draws a gap', () => {
    expect(toPlotValues(Float64Array.of(1, NaN))).toEqual([1, null]);
  });
});

describe('seriesRange', () => {
  test('pads the channel range by 5%', () => {
    expect(seriesRange(channel('RPM'))).toEqual([-5, 105]);
  });
  test('a constant channel gets ±1', () => {
    expect(seriesRange(fakeChannel([7, 7, 7]))).toEqual([6, 8]);
  });
  test('an all-NaN channel falls back to [0, 1]', () => {
    expect(seriesRange(fakeChannel([NaN, NaN]))).toEqual([0, 1]);
  });
  test('manual bounds override either end', () => {
    expect(seriesRange(channel('RPM'), { max: 50 })).toEqual([-5, 50]);
    expect(seriesRange(channel('RPM'), { min: 0, max: 7000 })).toEqual([0, 7000]);
  });
});

test('formatValue', () => {
  expect(formatValue(5240.4)).toBe('5,240');
  expect(formatValue(12.4123)).toBe('12.412');
  expect(formatValue(0.052)).toBe('0.052');
  expect(formatValue(null)).toBe('—');
  expect(formatValue(undefined)).toBe('—');
  expect(formatValue(NaN)).toBe('—');
});

test('formatTime says "row" for index-based logs and seconds otherwise', () => {
  expect(formatTime(42, { kind: 'index' })).toBe('row 42');
  expect(formatTime(1.23456, { kind: 'column', channelId: 'c0', originalUnit: 's' })).toBe(
    '1.235 s',
  );
});

describe('buildPaneOptions', () => {
  test('one scale per series, one visible y axis on the first series', () => {
    const { opts, data } = build(pane(['RPM', 'AFR']));
    expect(opts.series).toHaveLength(3);
    expect(opts.scales!['y:RPM'].range).toEqual([-5, 105]);
    expect(opts.scales!['y:AFR'].range).toEqual(seriesRange(channel('AFR')));
    const yAxes = opts.axes!.slice(1).filter((a) => a.show !== false);
    expect(yAxes).toHaveLength(1);
    expect(yAxes[0].scale).toBe('y:RPM');
    expect(data[0]).toBe(log.time);
    expect(opts.cursor!.sync!.key).toBe('dlv');
    expect(opts.series[1].stroke).toBe(resolveSeriesColor('s1', 'dark'));
    expect(opts.series[2].stroke).toBe(resolveSeriesColor('s2', 'dark'));
  });

  test('the visible axis follows axisHeader', () => {
    const { opts } = build(pane(['RPM', 'AFR']), 'AFR');
    const yAxes = opts.axes!.slice(1).filter((a) => a.show !== false);
    expect(yAxes[0].scale).toBe('y:AFR');
  });

  test('shared axis puts every series on one scale covering all of them', () => {
    const { opts } = build(pane(['RPM', 'AFR'], true));
    expect(opts.series.slice(1).map((s) => s.scale)).toEqual(['y', 'y']);
    expect(opts.scales!.y.range).toEqual([-5, 105]);
  });

  test('series whose channel is missing from the log are left out', () => {
    const { opts, data } = build(pane(['RPM', 'Boost (psi)']));
    expect(opts.series).toHaveLength(2);
    expect(data).toHaveLength(2);
  });
});
