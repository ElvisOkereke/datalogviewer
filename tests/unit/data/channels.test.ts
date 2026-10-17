import { describe, expect, test } from 'vitest';
import { findChannel, splitHeaderUnit } from '@/data/channels';
import type { Channel, Log } from '@/data/types';

describe('splitHeaderUnit', () => {
  test.each([
    ['Calculated MAP (psi)', 'Calculated MAP', 'psi'],
    ['Accelerator Position (°TPS)', 'Accelerator Position', '°TPS'],
    ['Engine Load (mg/stroke)', 'Engine Load', 'mg/stroke'],
    ['MAP [kPa]', 'MAP', 'kPa'],
    ['  Time (s)  ', 'Time', 's'],
  ])('%s', (header, name, unit) => {
    expect(splitHeaderUnit(header)).toEqual({ name, unit });
  });

  test('leaves headers without a trailing unit alone', () => {
    expect(splitHeaderUnit('AFR')).toEqual({ name: 'AFR' });
    expect(splitHeaderUnit('Gear (est) ratio')).toEqual({ name: 'Gear (est) ratio' });
    expect(splitHeaderUnit('Lambda #2')).toEqual({ name: 'Lambda #2' });
    expect(splitHeaderUnit('Odd ()')).toEqual({ name: 'Odd ()' });
  });
});

describe('findChannel', () => {
  const ch = (header: string, name: string): Channel => ({
    id: header,
    header,
    name,
    kind: 'numeric',
    values: null,
    text: null,
    min: NaN,
    max: NaN,
  });
  const log = { channels: [ch('MAP (kPa)', 'MAP'), ch('RPM', 'RPM')] } as Log;

  test('matches the exact header first', () => {
    expect(findChannel(log, 'MAP (kPa)')?.id).toBe('MAP (kPa)');
  });

  test('falls back to a case-insensitive name match', () => {
    expect(findChannel(log, 'map (psi)')?.id).toBe('MAP (kPa)');
    expect(findChannel(log, 'rpm')?.id).toBe('RPM');
  });

  test('returns undefined when absent', () => {
    expect(findChannel(log, 'AFR')).toBeUndefined();
  });
});
