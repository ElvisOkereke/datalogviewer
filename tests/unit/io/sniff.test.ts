import { describe, expect, test } from 'vitest';
import {
  detectDecimalComma,
  detectDelimiter,
  findHeaderIndex,
  modalFieldCount,
  numericFraction,
  splitLine,
} from '@/io/csv/sniff';

describe('splitLine', () => {
  test('honours quotes and escaped quotes', () => {
    expect(splitLine('1,"ok, fine","say ""hi"""', ',')).toEqual(['1', 'ok, fine', 'say "hi"']);
  });
  test('keeps empty trailing fields', () => {
    expect(splitLine('a,b,,', ',')).toEqual(['a', 'b', '', '']);
  });
});

test('modalFieldCount finds the most common count', () => {
  expect(modalFieldCount(['a,b,c', '1,2,3', 'x'], ',')).toEqual({ count: 3, lines: 2 });
});

describe('detectDelimiter', () => {
  test('comma', () => expect(detectDelimiter(['a,b,c', '1,2,3', '4,5,6'])).toBe(','));
  test('tab', () => expect(detectDelimiter(['a\tb', '1\t2'])).toBe('\t'));
  test('pipe', () => expect(detectDelimiter(['a|b', '1|2'])).toBe('|'));
  test('semicolon with decimal commas, no header', () => {
    // Commas split every line into 3 fields too — semicolon must still win.
    expect(detectDelimiter(['0,05;812,3', '0,10;815,0', '0,15;820,9'])).toBe(';');
  });
  test('defaults to comma for a single column', () => {
    expect(detectDelimiter(['RPM', '800', '900'])).toBe(',');
  });
});

describe('detectDecimalComma', () => {
  test('true when comma decimals dominate a non-comma file', () => {
    expect(
      detectDecimalComma(
        [
          ['0,05', '812,3'],
          ['0,10', '815'],
        ],
        ';',
      ),
    ).toBe(true);
  });
  test('false for dot decimals', () => {
    expect(detectDecimalComma([['0.05', '812.3']], ';')).toBe(false);
  });
  test('never for comma-delimited files', () => {
    expect(detectDecimalComma([['0,05']], ',')).toBe(false);
  });
});

describe('findHeaderIndex', () => {
  test('skips preamble lines with a different field count', () => {
    expect(
      findHeaderIndex(['Capture Date: 2026-10-01', 'Logger: X', 'Time;RPM', '0;800'], ';'),
    ).toBe(2);
  });
  test('skips mostly-blank preamble lines that happen to have the right count', () => {
    expect(findHeaderIndex(['Exported,,', 'Time,RPM,AFR', '0,800,14.7'], ',')).toBe(1);
  });
  test('0 when there is no preamble', () => {
    expect(findHeaderIndex(['a,b', '1,2'], ',')).toBe(0);
  });
});

test('numericFraction ignores blanks', () => {
  expect(numericFraction(['1', '', 'x', '2.5'], '.')).toBeCloseTo(2 / 3);
  expect(numericFraction(['', ' '], '.')).toBe(0);
});
