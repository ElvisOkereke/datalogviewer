// @vitest-environment node
import { expect, test } from 'vitest';
import { parseCsvText } from '@/io/csv/parseCsv';
import { DEMO_HEADER, generateDemoLog } from '../../../scripts/demoLog';

const parse = (csv: string) => parseCsvText(csv, { fileName: 'demo-run.csv', encoding: 'utf-8' });

test('demo log is deterministic and parses cleanly', () => {
  const csv = generateDemoLog();
  expect(generateDemoLog()).toBe(csv);
  const log = parse(csv);
  expect(log.rowCount).toBe(9600);
  expect(log.channels.map((c) => c.header)).toEqual(DEMO_HEADER);
  expect(log.timeSource).toMatchObject({ kind: 'column', originalUnit: 's' });
  expect(log.meta.warnings).toEqual([]);
  const mode = log.channels.find((c) => c.name === 'Fuel Mode')!;
  expect(mode.kind).toBe('text');
  expect(new Set(mode.text)).toEqual(new Set(['Idle', 'Closed Loop', 'Open Loop', 'Decel Cut']));
});

test('values stay physically plausible', () => {
  const log = parse(generateDemoLog());
  const range = (name: string) => {
    const ch = log.channels.find((c) => c.name === name)!;
    return [ch.min, ch.max];
  };
  const [rpmMin, rpmMax] = range('Engine Speed');
  expect(rpmMin).toBeGreaterThan(700);
  expect(rpmMax).toBeLessThanOrEqual(6900);
  const [, mapMax] = range('MAP');
  expect(mapMax).toBeGreaterThan(150);
  expect(mapMax).toBeLessThan(220);
  const [afrMin, afrMax] = range('AFR');
  expect(afrMin).toBeGreaterThan(10.5);
  expect(afrMax).toBeLessThan(23);
});
