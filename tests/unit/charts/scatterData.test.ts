// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { defaultScatter, scatterPoints } from '@/charts/scatterData';
import { parseCsvText } from '@/io/csv/parseCsv';

const parse = (csv: string) => parseCsvText(csv, { fileName: 't.csv', encoding: 'utf-8' });
const log = parse(
  'Time (s),RPM,MAP (kPa),AFR\n0,800,30,14.7\n1,900,,14\n2,1000,50,13\n3,1100,60,12',
);

describe('scatterPoints', () => {
  test('pairs x and y within the scope, skipping rows with gaps', () => {
    const r = scatterPoints(log, { x: 'RPM', y: 'MAP (kPa)', color: 'AFR' }, { min: 0, max: 2 });
    if ('error' in r) throw new Error(r.error);
    expect(Array.from(r.x)).toEqual([800, 1000]);
    expect(Array.from(r.y)).toEqual([30, 50]);
    expect(Array.from(r.c!)).toEqual([14.7, 13]);
    expect(Array.from(r.t)).toEqual([0, 2]);
    expect(r).toMatchObject({ total: 2, shown: 2 });
  });

  test('the whole log when there is no scope; colour is optional', () => {
    const r = scatterPoints(log, { x: 'RPM', y: 'AFR' }, null);
    if ('error' in r) throw new Error(r.error);
    expect(r.shown).toBe(4);
    expect(r.c).toBeNull();
  });

  test('large selections are thinned to an evenly spaced sample', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => `${i},${i},${i * 2}`).join('\n');
    const big = parse(`Time (s),A,B\n${rows}`);
    const r = scatterPoints(big, { x: 'A', y: 'B' }, null, 100);
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ total: 1000, shown: 100 });
    expect(r.x[0]).toBe(0);
    expect(r.x[1]).toBe(10);
    expect(r.x[99]).toBe(990);
  });

  test('labels name the channels actually plotted, not the loose name that found them', () => {
    const r = scatterPoints(log, { x: 'rpm', y: 'MAP', color: 'afr' }, null);
    if ('error' in r) throw new Error(r.error);
    expect(r.labels).toEqual({ x: 'RPM', y: 'MAP (kPa)', color: 'AFR' });
    const plain = scatterPoints(log, { x: 'RPM', y: 'AFR' }, null);
    if ('error' in plain) throw new Error(plain.error);
    expect(plain.labels).toEqual({ x: 'RPM', y: 'AFR', color: null });
  });

  test('missing or empty channels explain themselves', () => {
    expect(scatterPoints(log, { x: 'Boost', y: 'RPM' }, null)).toEqual({
      error: "[Boost] isn't in this log",
    });
    expect(scatterPoints(log, { x: '', y: 'RPM' }, null)).toEqual({
      error: 'Choose an X and a Y channel',
    });
    const empty = parse('Time (s),A,B\n0,,1\n1,,2');
    expect(scatterPoints(empty, { x: 'A', y: 'B' }, null)).toEqual({ error: 'No points to show' });
  });
});

test('defaultScatter picks the first two plottable non-time channels', () => {
  expect(defaultScatter(log)).toEqual({ x: 'RPM', y: 'MAP (kPa)' });
  expect(defaultScatter(parse('Time (s),RPM\n0,1\n1,2'))).toBeNull();
});
