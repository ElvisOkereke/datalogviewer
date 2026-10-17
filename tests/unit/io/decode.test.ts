// @vitest-environment node
import { expect, test } from 'vitest';
import { decodeBytes } from '@/io/csv/decode';

test('decodes UTF-8 and strips a BOM', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Temp (°C)\n1')]);
  expect(decodeBytes(bytes)).toEqual({ text: 'Temp (°C)\n1', encoding: 'utf-8' });
});

test('falls back to windows-1252 when the bytes are not valid UTF-8', () => {
  // "Temp (°C)" with ° as the single windows-1252 byte 0xB0
  const bytes = new Uint8Array([
    ...new TextEncoder().encode('Temp ('),
    0xb0,
    ...new TextEncoder().encode('C)\n1'),
  ]);
  expect(decodeBytes(bytes)).toEqual({ text: 'Temp (°C)\n1', encoding: 'windows-1252' });
});
