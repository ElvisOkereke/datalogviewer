import type { XRange } from '@/charts/range';
import type { Channel, Log } from './types';

/** Trims float noise (0.1 + 0.2 → 0.3) without rounding real precision away. */
const num = (v: number) => (Number.isFinite(v) ? String(Number(v.toPrecision(15))) : '');

/**
 * Text from the log, made safe for a CSV cell: quoted when it holds a separator, quote or line
 * break, and prefixed with ' when a spreadsheet would otherwise run it as a formula.
 */
function textCell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows [i0, i1) of `channels` as CSV: the time (or row) column first, then one per channel. */
export function buildCsv(log: Log, channels: Channel[], i0: number, i1: number): string {
  const timeHeader = log.timeSource.kind === 'index' ? 'Row' : 'Time (s)';
  const lines = [[timeHeader, ...channels.map((c) => textCell(c.header))].join(',')];
  for (let i = i0; i < i1; i++) {
    const cells = [num(log.time[i])];
    for (const c of channels) {
      cells.push(c.values ? num(c.values[i]) : textCell(c.text?.[i] ?? ''));
    }
    lines.push(cells.join(','));
  }
  return lines.join('\n') + '\n';
}

/** "<log name>-<start>-<end>s.csv", or "<log name>-row<start>-<end>.csv" for index logs. */
export function csvFileName(log: Log, r: XRange): string {
  const base = log.fileName.replace(/\.[^.]*$/, '');
  if (log.timeSource.kind === 'index') {
    return `${base}-row${Math.round(r.min)}-${Math.round(r.max)}.csv`;
  }
  const s = (v: number) => String(Number(v.toFixed(2)));
  return `${base}-${s(r.min)}-${s(r.max)}s.csv`;
}
