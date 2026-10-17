// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { withCalculated } from '@/data/calculated';
import { findChannel } from '@/data/channels';
import { buildCsv, csvFileName } from '@/data/exportCsv';
import type { Channel, Log } from '@/data/types';
import { parseCsvText } from '@/io/csv/parseCsv';

const parse = (csv: string, fileName = 'run.csv') =>
  parseCsvText(csv, { fileName, encoding: 'utf-8' });
const pick = (log: Log, ...headers: string[]): Channel[] =>
  headers.map((h) => findChannel(log, h)!);

const log = parse(
  'Time (s),RPM,MAP (kPa),Note\n0,800,30,idle\n0.5,900,,"rich, cold"\n1,1000,50,=SUM(A1)\n1.5,1100,60,"say ""hi"""',
);

describe('buildCsv', () => {
  test('time column first, then each channel under its header', () => {
    expect(buildCsv(log, pick(log, 'RPM', 'MAP (kPa)'), 0, 2)).toBe(
      'Time (s),RPM,MAP (kPa)\n0,800,30\n0.5,900,\n',
    );
  });

  test('gaps are empty cells; text is quoted when it needs to be', () => {
    const csv = buildCsv(log, pick(log, 'MAP (kPa)', 'Note'), 0, 4);
    expect(csv.split('\n')).toEqual([
      'Time (s),MAP (kPa),Note',
      '0,30,idle',
      '0.5,,"rich, cold"',
      // Spreadsheets would run a cell starting with = as a formula; it is kept as text.
      "1,50,'=SUM(A1)",
      '1.5,60,"say ""hi"""',
      '',
    ]);
  });

  test('formula guard looks past leading whitespace and covers | too', () => {
    const t = parse('Time (s),Note\n0,a\n1,b\n2,c');
    const note = t.channels.find((c) => c.header === 'Note')!;
    note.text = ['  =1+1', '|cmd', '﻿@SUM(A1)'];
    expect(buildCsv(t, [note], 0, 3).split('\n').slice(1, 4)).toEqual([
      "0,'  =1+1",
      "1,'|cmd",
      "2,'﻿@SUM(A1)",
    ]);
  });

  test('calculated channels export their values', () => {
    const { log: wb } = withCalculated(log, [
      { id: 'k', name: 'Double', unit: 'rpm', expression: '[RPM] * 2' },
    ]);
    expect(buildCsv(wb, pick(wb, 'Double (rpm)'), 2, 4)).toBe(
      'Time (s),Double (rpm)\n1,2000\n1.5,2200\n',
    );
  });

  test('logs without a time column use row numbers', () => {
    const rows = parse('A,B\n1,2\n3,4');
    expect(buildCsv(rows, pick(rows, 'A'), 0, 2)).toBe('Row,A\n0,1\n1,3\n');
  });
});

describe('csvFileName', () => {
  test('names the time span in seconds', () => {
    const demo = parse('Time (s),A\n0,1\n1,2', 'demo-run.csv');
    expect(csvFileName(demo, { min: 0, max: 479.95 })).toBe('demo-run-0-479.95s.csv');
    expect(csvFileName(log, { min: 1.23456, max: 2 })).toBe('run-1.23-2s.csv');
  });

  test('names the row span for index logs', () => {
    expect(csvFileName(parse('A,B\n1,2\n3,4', 'x.log.csv'), { min: 10, max: 250.4 })).toBe(
      'x.log-row10-250.csv',
    );
  });
});
