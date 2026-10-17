import { describe, expect, test } from 'vitest';
import {
  isMillisChannel,
  isNonDecreasing,
  isTimeChannel,
  parseClockOrDate,
  toRelativeSeconds,
} from '@/io/csv/time';

test.each([
  ['Time', 's', true],
  ['time', undefined, true],
  ['Timestamp', undefined, true],
  ['SecL', undefined, true],
  ['ms', undefined, true],
  ['Elapsed', 's', true],
  ['RPM', 'rpm', false],
  ['Time Since Start Of Boost', undefined, false],
])('isTimeChannel(%s, %s) = %s', (name, unit, expected) => {
  expect(isTimeChannel(name, unit)).toBe(expected);
});

test('isMillisChannel', () => {
  expect(isMillisChannel('ms')).toBe(true);
  expect(isMillisChannel('Time', 'ms')).toBe(true);
  expect(isMillisChannel('Time', 's')).toBe(false);
});

describe('parseClockOrDate', () => {
  test('clock times → seconds of day', () => {
    expect(parseClockOrDate('12:00:01.5')).toBeCloseTo(43201.5);
  });
  test('date-times → epoch seconds', () => {
    const a = parseClockOrDate('2026-10-01 12:00:00.000');
    const b = parseClockOrDate('2026-10-01 12:00:00.500');
    expect(b - a).toBeCloseTo(0.5);
  });
  test('rejects words and bare numbers', () => {
    expect(parseClockOrDate('Idle')).toBeNaN();
    expect(parseClockOrDate('12')).toBeNaN();
    expect(parseClockOrDate('')).toBeNaN();
  });
});

test('isNonDecreasing ignores gaps', () => {
  expect(isNonDecreasing(Float64Array.of(0, NaN, 1, 1, 2))).toBe(true);
  expect(isNonDecreasing(Float64Array.of(0, 2, 1))).toBe(false);
  expect(isNonDecreasing(Float64Array.of(NaN, NaN))).toBe(false);
});

test('toRelativeSeconds scales, rebases and forward-fills', () => {
  expect(Array.from(toRelativeSeconds(Float64Array.of(NaN, 1000, NaN, 1100), 0.001))).toEqual([
    0, 0, 0, 0.1,
  ]);
});

describe('parseClockOrDate formats', () => {
  test('ISO-like with a space or T, fractional seconds', () => {
    const a = parseClockOrDate('2026-10-01 12:00:00');
    expect(parseClockOrDate('2026-10-01T12:00:00.250') - a).toBeCloseTo(0.25);
  });
  test('day-first dotted dates', () => {
    expect(parseClockOrDate('18.10.2026 00:00:00') - parseClockOrDate('17.10.2026 00:00:00')).toBe(
      86400,
    );
  });
  test('slashed dates are day-first when the first number is over 12', () => {
    expect(parseClockOrDate('25/10/2026 00:00:00') - parseClockOrDate('24/10/2026 00:00:00')).toBe(
      86400,
    );
    expect(parseClockOrDate('10/25/2026 00:00:00') - parseClockOrDate('10/24/2026 00:00:00')).toBe(
      86400,
    );
  });
});
