// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import type { Log } from '@/data/types';
import { parseCsvText } from '@/io/csv/parseCsv';

const parse = (text: string) => parseCsvText(text, { fileName: 'test.csv', encoding: 'utf-8' });
const byName = (log: Log, name: string) => {
  const ch = log.channels.find((c) => c.name === name);
  if (!ch)
    throw new Error(`no channel ${name}; have ${log.channels.map((c) => c.name).join(', ')}`);
  return ch;
};
const nums = (log: Log, name: string) => Array.from(byName(log, name).values!);
const codes = (log: Log) => log.meta.warnings.map((w) => w.code);

describe('real-world export (autodata fixture)', () => {
  const text = readFileSync('tests/fixtures/autodata-sheet2.csv', 'utf8');
  const log = parse(text);
  const dataLines = text.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1;

  test('reads every row and column with units', () => {
    expect(log.rowCount).toBe(dataLines);
    expect(log.channels.map((c) => [c.name, c.unit])).toEqual([
      ['Accelerator Position', '°TPS'],
      ['Calculated MAP', 'psi'],
      ['Coolant Temperature', '°C'],
      ['Engine Load', 'mg/stroke'],
      ['Filtered Load', 'mg/stroke'],
      ['Intake Air Temperature', '°C'],
    ]);
  });

  test('computes min/max and keeps the header row out of the data', () => {
    const tps = byName(log, 'Accelerator Position');
    expect(tps.values![0]).toBe(10.2);
    expect(tps.min).toBe(6.5);
    expect(tps.max).toBe(28.1);
    expect(byName(log, 'Engine Load').max).toBe(312.64);
  });

  test('falls back to row numbers with a notice', () => {
    expect(log.timeSource).toEqual({ kind: 'index' });
    expect(Array.from(log.time.slice(0, 3))).toEqual([0, 1, 2]);
    expect(codes(log)).toContain('no-time-column');
  });
});

test('semicolons, decimal commas, preamble, units row and a text column', () => {
  const log = parse(
    [
      'Capture Date: 2026-10-01',
      'Logger: TestBox v2',
      'Time;RPM;AFR;Mode',
      's;rpm;:1;',
      '0,00;812;14,7;Idle',
      '0,05;815,5;14,6;Idle',
      '0,10;1020;13,9;Open Loop',
    ].join('\n'),
  );
  expect(log.meta).toMatchObject({ delimiter: ';', decimal: ',' });
  expect(log.meta.preamble).toEqual(['Capture Date: 2026-10-01', 'Logger: TestBox v2']);
  expect(byName(log, 'RPM').unit).toBe('rpm');
  expect(byName(log, 'Mode').unit).toBeUndefined();
  expect(nums(log, 'RPM')).toEqual([812, 815.5, 1020]);
  expect(byName(log, 'Mode')).toMatchObject({
    kind: 'text',
    values: null,
    text: ['Idle', 'Idle', 'Open Loop'],
  });
  expect(log.timeSource).toEqual({
    kind: 'column',
    channelId: byName(log, 'Time').id,
    originalUnit: 's',
  });
  expect(log.time[2]).toBeCloseTo(0.1);
});

test('millisecond time column', () => {
  const log = parse('ms,RPM\n0,800\n50,810\n100,820');
  expect(log.timeSource).toMatchObject({ kind: 'column', originalUnit: 'ms' });
  expect(log.time[0]).toBe(0);
  expect(log.time[1]).toBeCloseTo(0.05);
  expect(log.time[2]).toBeCloseTo(0.1);
});

test('date-time and clock time columns', () => {
  const dt = parse('Timestamp,RPM\n2026-10-01 12:00:00.000,800\n2026-10-01 12:00:00.500,810');
  expect(dt.timeSource).toMatchObject({ kind: 'column', originalUnit: 'datetime' });
  expect(dt.time[1]).toBeCloseTo(0.5);

  const clock = parse('Time,RPM\n12:00:00.0,800\n12:00:00.1,810');
  expect(clock.timeSource).toMatchObject({ kind: 'column', originalUnit: 'datetime' });
  expect(clock.time[1]).toBeCloseTo(0.1);
});

test('ragged rows load with gaps and warnings', () => {
  const log = parse('a,b,c\n1,2,3\n4,5\n6,7,8,9');
  expect(nums(log, 'c')).toEqual([3, NaN, 8]);
  expect(log.meta.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'short-rows', count: 1, firstRow: 3 }),
      expect.objectContaining({ code: 'long-rows', count: 1, firstRow: 4 }),
    ]),
  );
});

test('a few non-numeric cells become gaps with a warning', () => {
  const rows = Array.from({ length: 20 }, (_, i) => `${i},${i === 7 ? 'ERR' : i * 2}`);
  const log = parse(['n,v', ...rows].join('\n'));
  expect(byName(log, 'v').kind).toBe('numeric');
  expect(byName(log, 'v').values![7]).toBeNaN();
  expect(log.meta.warnings).toContainEqual(
    expect.objectContaining({ code: 'non-numeric-cells', count: 1 }),
  );
});

test('no header row → generated names', () => {
  const log = parse('1,2\n3,4');
  expect(log.channels.map((c) => c.header)).toEqual(['Column 1', 'Column 2']);
  expect(log.rowCount).toBe(2);
});

describe('errors', () => {
  const codeOf = (text: string) => {
    try {
      parse(text);
    } catch (e) {
      return e instanceof LogParseError ? e.code : 'not-a-LogParseError';
    }
    return 'no-error';
  };
  test('empty file', () => expect(codeOf('')).toBe('empty'));
  test('blank lines only', () => expect(codeOf('\n \n')).toBe('empty'));
  test('header but no rows', () => expect(codeOf('a,b\n')).toBe('empty'));
  test('no numeric columns', () =>
    expect(codeOf('name,colour\nfoo,red\nbar,blue')).toBe('no-numeric-columns'));
  test('absurdly wide files are rejected instead of allocated', () => {
    const cells = (v: (i: number) => string) =>
      Array.from({ length: 5000 }, (_, i) => v(i)).join(',');
    expect(codeOf(`${cells((i) => `c${i}`)}\n${cells(() => '1')}`)).toBe('unsupported');
  });
});

describe('sniffer and parser agree on rows', () => {
  test('delimiter-only rows above the header do not shift it', () => {
    const log = parse('Exported by LoggerX\n,,\nTime,RPM,AFR\n0,800,14.7\n0.05,810,14.6');
    expect(log.channels.map((c) => c.name)).toEqual(['Time', 'RPM', 'AFR']);
    expect(log.meta.preamble).toEqual(['Exported by LoggerX']);
    expect(log.rowCount).toBe(2);
  });

  test('a quote inside a header cell is an ordinary character', () => {
    const log = parse('Pipe 2" (in),RPM\n1,800\n2,810');
    expect(log.channels.map((c) => c.header)).toEqual(['Pipe 2" (in)', 'RPM']);
  });

  test('a quoted header cell spanning two lines', () => {
    const log = parse('"Note\nline 2",RPM\n1,800\n2,810');
    expect(log.channels.map((c) => c.header)).toEqual(['Note\nline 2', 'RPM']);
    expect(log.rowCount).toBe(2);
  });
});

describe('review focus', () => {
  test('trailing empty columns from spreadsheet exports are dropped', () => {
    const log = parse('a,b,,\n1,2,,\n3,4,,');
    expect(log.channels.map((c) => c.header)).toEqual(['a', 'b']);
  });

  test('duplicate headers stay distinct', () => {
    const log = parse('Lambda,Lambda\n1,2');
    expect(log.channels.map((c) => c.header)).toEqual(['Lambda', 'Lambda #2']);
    expect(new Set(log.channels.map((c) => c.id)).size).toBe(2);
  });

  test('quoted cells containing the delimiter', () => {
    const log = parse('id,"Status, note",RPM\n1,"ok, fine",800\n2,"bad, really",900');
    expect(log.channels.map((c) => c.header)).toEqual(['id', 'Status, note', 'RPM']);
    expect(byName(log, 'Status, note').text).toEqual(['ok, fine', 'bad, really']);
    expect(codes(log)).not.toContain('long-rows');
  });

  test('CRLF and a trailing newline add no phantom row', () => {
    expect(parse('a,b\r\n1,2\r\n3,4\r\n').rowCount).toBe(2);
  });

  test('a time column that goes backwards falls back to row numbers', () => {
    const log = parse('Time,RPM\n0,800\n1,810\n0.5,820');
    expect(log.timeSource).toEqual({ kind: 'index' });
    expect(codes(log)).toContain('time-not-monotonic');
  });
});

test('reports progress ending at 1', () => {
  const seen: number[] = [];
  const rows = Array.from({ length: 50_000 }, (_, i) => `${i},${i}`).join('\n');
  parseCsvText(`a,b\n${rows}`, {
    fileName: 'p.csv',
    encoding: 'utf-8',
    onProgress: (f) => seen.push(f),
  });
  expect(seen.length).toBeGreaterThan(1);
  expect(seen.at(-1)).toBe(1);
  expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true);
});
