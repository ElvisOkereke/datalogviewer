// @vitest-environment node
import { expect, test } from 'vitest';
import { withCalculated } from '@/data/calculated';
import { parseCsvText } from '@/io/csv/parseCsv';

const log = parseCsvText('Time (s),RPM,AFR\n0,800,14.7\n0.05,900,13.0\n0.1,1000,11.76', {
  fileName: 't.csv',
  encoding: 'utf-8',
});
const channel = (l: typeof log, name: string) => l.channels.find((c) => c.name === name);

test('another calculated channel can be referenced by its header as well as its name', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'p', name: 'Pct', expression: '[Lambda (λ)] * 100' },
    { id: 'q', name: 'Pct2', expression: '[lambda] * 100' },
    { id: 'l', name: 'Lambda', unit: 'λ', expression: '[AFR] / 14.7' },
  ]);
  expect(errors).toEqual({});
  expect(channel(out, 'Pct')!.values![0]).toBeCloseTo(100);
  expect(channel(out, 'Pct2')!.values![0]).toBeCloseTo(100);
});

test('a definition becomes a calculated channel after the file channels', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'k1', name: 'Lambda', unit: 'λ', expression: '[AFR] / 14.7' },
  ]);
  expect(errors).toEqual({});
  const lambda = channel(out, 'Lambda')!;
  expect(lambda).toMatchObject({
    id: 'calc:k1',
    header: 'Lambda (λ)',
    unit: 'λ',
    kind: 'calculated',
  });
  expect(lambda.values![0]).toBeCloseTo(1);
  expect(lambda.min).toBeCloseTo(0.8);
  expect(lambda.max).toBeCloseTo(1);
  expect(out.channels.at(-1)).toBe(lambda);
  expect(out.channels.length).toBe(log.channels.length + 1);
});

test('definitions can use each other, in any order', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'b', name: 'Doubled', expression: '[Half] * 4' },
    { id: 'a', name: 'Half', expression: 'RPM / 2' },
  ]);
  expect(errors).toEqual({});
  expect(channel(out, 'Doubled')!.values![0]).toBe(1600);
});

test('cycles are reported for every definition in them', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'a', name: 'A', expression: '[B] + 1' },
    { id: 'b', name: 'B', expression: '[A] * 2' },
    { id: 'c', name: 'C', expression: 'RPM' },
  ]);
  expect(errors.a).toContain('refers to itself');
  expect(errors.b).toContain('refers to itself');
  expect(channel(out, 'C')).toBeDefined();
});

test('a missing channel is reported and does not affect the others', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'x', name: 'Ratio', expression: '[Lambda] * 2' },
    { id: 'y', name: 'Fine', expression: '[AFR] + 0' },
  ]);
  expect(errors.x).toBe('needs [Lambda]');
  expect(channel(out, 'Ratio')).toBeUndefined();
  expect(channel(out, 'Fine')).toBeDefined();
});

test('syntax errors are reported as messages', () => {
  const { errors } = withCalculated(log, [{ id: 'z', name: 'Bad', expression: '[AFR] /' }]);
  expect(errors.z).toMatch(/at character/);
});

test('no definitions returns the same log object', () => {
  expect(withCalculated(log, []).log).toBe(log);
});

test('ids that look like built-in object properties are still evaluated', () => {
  const { log: out, errors } = withCalculated(log, [
    { id: 'constructor', name: 'Double', expression: '[RPM] * 2' },
  ]);
  expect(errors).toEqual({});
  expect(channel(out, 'Double')!.values![0]).toBe(1600);
});
