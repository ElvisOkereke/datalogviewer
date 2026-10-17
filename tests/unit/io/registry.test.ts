// @vitest-environment node
import { expect, test } from 'vitest';
import { LogParseError } from '@/data/errors';
import { csvReader } from '@/io/csv/reader';
import { readLog } from '@/io/registry';

test('csvReader prefers known extensions and rejects binary', () => {
  const text = new TextEncoder().encode('a,b\n1,2');
  expect(csvReader.sniff(text, 'run.csv')).toBeGreaterThan(csvReader.sniff(text, 'run.dat'));
  expect(csvReader.sniff(new Uint8Array([0x4d, 0x4c, 0x00, 0x01]), 'run.mlg')).toBe(0);
});

test('readLog parses a CSV File and reports progress', async () => {
  const seen: number[] = [];
  const log = await readLog(new File(['Time,RPM\n0,800\n0.05,810'], 'run.csv'), (f) =>
    seen.push(f),
  );
  expect(log.fileName).toBe('run.csv');
  expect(log.rowCount).toBe(2);
  expect(log.meta.encoding).toBe('utf-8');
  expect(seen.at(-1)).toBe(1);
});

test('readLog rejects unsupported files', async () => {
  const file = new File([new Uint8Array([0, 1, 2, 3])], 'blob.bin');
  await expect(readLog(file, () => {})).rejects.toMatchObject({ code: 'unsupported' });
  await expect(readLog(file, () => {})).rejects.toBeInstanceOf(LogParseError);
});
