import type { Channel, ParseWarning, TimeSource } from '@/data/types';

const TIME_NAME = /^(time|timestamp|secl?|seconds?|ms|millis(econds)?)$/i;
const MS_NAME = /^(ms|millis(econds)?)$/i;
const TIME_UNIT = /^(s|sec|secs|ms)$/i;
const CLOCK = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/;
const HAS_DATE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;
const TIME_PART = String.raw`[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?`;
const ISO_DATE = new RegExp(
  String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${TIME_PART}(?:Z|[+-]\d{2}:?\d{2})?$`,
);
const DOT_DATE = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4})${TIME_PART}$`);
const SLASH_DATE = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})${TIME_PART}$`);

/**
 * Seconds for a wall-clock date-time, computed with Date.UTC so every browser agrees (Date.parse
 * of "YYYY-MM-DD hh:mm:ss" is engine-specific). Only differences matter, so the zone is ignored.
 */
function wallClockSeconds(y: string, mo: string, d: string, h: string, mi: string, s = '0') {
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) / 1000 + Number(s);
}

function parseDateTime(s: string): number {
  let m = ISO_DATE.exec(s);
  if (m) return wallClockSeconds(m[1], m[2], m[3], m[4], m[5], m[6]);
  m = DOT_DATE.exec(s); // European loggers: day.month.year
  if (m) return wallClockSeconds(m[3], m[2], m[1], m[4], m[5], m[6]);
  m = SLASH_DATE.exec(s); // Month first, unless the first number can only be a day.
  if (m) {
    const dayFirst = Number(m[1]) > 12;
    return wallClockSeconds(m[3], dayFirst ? m[2] : m[1], dayFirst ? m[1] : m[2], m[4], m[5], m[6]);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t / 1000;
}

export function isTimeChannel(name: string, unit?: string): boolean {
  return TIME_NAME.test(name.trim()) || (unit !== undefined && TIME_UNIT.test(unit.trim()));
}

export function isMillisChannel(name: string, unit?: string): boolean {
  return MS_NAME.test(name.trim()) || unit?.trim().toLowerCase() === 'ms';
}

/** "hh:mm:ss(.sss)" → seconds of day; a date-time string → epoch seconds; otherwise NaN. */
export function parseClockOrDate(cell: string): number {
  const s = cell.trim();
  if (!s) return NaN;
  const m = CLOCK.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  // Require a date part so arbitrary words or bare numbers are never read as dates.
  if (!HAS_DATE.test(s)) return NaN;
  return parseDateTime(s);
}

export function isNonDecreasing(values: Float64Array): boolean {
  let prev = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return prev !== -Infinity;
}

/** Multiplies by `scale`, shifts so the first sample is 0, and forward-fills gaps (x values can't be NaN). */
export function toRelativeSeconds(values: Float64Array, scale: number): Float64Array {
  const out = new Float64Array(values.length);
  let first = NaN;
  for (const v of values) {
    if (!Number.isNaN(v)) {
      first = v;
      break;
    }
  }
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isNaN(v)) prev = (v - first) * scale;
    out[i] = prev;
  }
  return out;
}

export function pickTime(
  channels: Channel[],
  datetimeIds: Set<string>,
  rowCount: number,
): { time: Float64Array; timeSource: TimeSource; warning?: ParseWarning } {
  let rejected: { ch: Channel; reason: 'backwards' | 'constant' } | undefined;
  for (const ch of channels) {
    if (ch.kind !== 'numeric' || !ch.values || !isTimeChannel(ch.name, ch.unit)) continue;
    // Only columns *named* like time earn a warning; a unit-only match such as "Dwell (ms)" is
    // just a channel that happens to be measured in ms.
    const namedTime = TIME_NAME.test(ch.name.trim());
    if (!isNonDecreasing(ch.values)) {
      if (namedTime) rejected ??= { ch, reason: 'backwards' };
      continue;
    }
    if (!(ch.max > ch.min)) {
      if (namedTime) rejected ??= { ch, reason: 'constant' };
      continue;
    }
    const isDatetime = datetimeIds.has(ch.id);
    const isMs = !isDatetime && isMillisChannel(ch.name, ch.unit);
    return {
      time: toRelativeSeconds(ch.values, isMs ? 0.001 : 1),
      timeSource: {
        kind: 'column',
        channelId: ch.id,
        originalUnit: isDatetime ? 'datetime' : isMs ? 'ms' : 's',
      },
    };
  }

  const time = new Float64Array(rowCount);
  for (let i = 0; i < rowCount; i++) time[i] = i;
  const warning: ParseWarning = !rejected
    ? {
        code: 'no-time-column',
        message: 'No time column found, so samples are plotted by row number.',
      }
    : rejected.reason === 'backwards'
      ? {
          code: 'time-not-monotonic',
          message: `"${rejected.ch.header}" goes backwards (logger reset?), so samples are plotted by row number.`,
        }
      : {
          code: 'time-constant',
          message: `"${rejected.ch.header}" never changes, so samples are plotted by row number.`,
        };
  return { time, timeSource: { kind: 'index' }, warning };
}
