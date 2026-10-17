import { parseNumber } from './number';

export const DELIMITERS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

const SAMPLE_LINES = 50;
const CONSISTENT = 0.8;

/**
 * Quote-aware split of one line, used only to guess the delimiter. Like Papa Parse, a quote opens
 * a quoted field only at the start of a field; elsewhere it is an ordinary character.
 */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  let fieldStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && fieldStart) inQuotes = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = '';
      fieldStart = true;
      continue;
    } else cur += ch;
    fieldStart = false;
  }
  out.push(cur);
  return out;
}

export function modalFieldCount(
  lines: string[],
  delimiter: string,
): { count: number; lines: number } {
  return modeOf(lines.map((line) => splitLine(line, delimiter).length));
}

function modeOf(counts: number[]): { count: number; lines: number } {
  const freq = new Map<number, number>();
  for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1);
  let best = { count: 1, lines: 0 };
  for (const [count, n] of freq) {
    if (n > best.lines || (n === best.lines && count > best.count)) best = { count, lines: n };
  }
  return best;
}

export function detectDelimiter(lines: string[]): Delimiter {
  const sample = lines.slice(0, SAMPLE_LINES);
  if (sample.length === 0) return ',';
  const scored = DELIMITERS.map((d) => {
    const m = modalFieldCount(sample, d);
    return { d, count: m.count, score: m.count >= 2 ? m.lines / sample.length : 0 };
  });
  // Semicolons, tabs and pipes rarely appear by accident, while commas double as decimal
  // separators — so a consistent non-comma delimiter wins over a consistent comma.
  const consistent = scored.filter((s) => s.score >= CONSISTENT);
  const nonComma = consistent.filter((s) => s.d !== ',');
  const pool = nonComma.length ? nonComma : consistent.length ? consistent : scored;
  pool.sort((a, b) => b.score - a.score || b.count - a.count);
  return pool[0].score > 0 ? pool[0].d : ',';
}

const COMMA_DECIMAL = /^[+-]?\d+,\d+$/;
const DOT_DECIMAL = /^[+-]?\d+\.\d+$/;

export function detectDecimalComma(rows: string[][], delimiter: Delimiter): boolean {
  if (delimiter === ',') return false;
  let comma = 0;
  let dot = 0;
  for (const row of rows) {
    for (const cell of row) {
      const c = cell.trim();
      if (COMMA_DECIMAL.test(c)) comma++;
      else if (DOT_DECIMAL.test(c)) dot++;
    }
  }
  return comma > dot;
}

/** First row with the file's usual field count and mostly non-blank cells; earlier rows are a preamble. */
export function findHeaderIndex(rows: string[][]): number {
  const { count } = modeOf(rows.map((r) => r.length));
  const i = rows.findIndex((cells) => {
    const filled = cells.filter((c) => c.trim() !== '').length;
    return cells.length === count && filled * 2 >= count;
  });
  return i < 0 ? 0 : i;
}

export function numericFraction(cells: string[], decimal: '.' | ','): number {
  let nonBlank = 0;
  let numeric = 0;
  for (const c of cells) {
    if (c.trim() === '') continue;
    nonBlank++;
    if (!Number.isNaN(parseNumber(c, decimal))) numeric++;
  }
  return nonBlank === 0 ? 0 : numeric / nonBlank;
}
