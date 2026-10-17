import Papa from 'papaparse';
import { MAX_HEADER_CHARS, splitHeaderUnit } from '@/data/channels';
import { LogParseError } from '@/data/errors';
import { GrowableF64 } from '@/data/growable';
import { finiteMinMax } from '@/data/stats';
import type { Channel, Log, ParseWarning } from '@/data/types';
import type { TextEncodingName } from './decode';
import { isBlankOrPlaceholder, parseNumber } from './number';
import {
  detectDecimalComma,
  detectDelimiter,
  effectiveLength,
  findHeaderIndex,
  modalEffectiveLength,
  numericFraction,
  type Delimiter,
} from './sniff';
import { isTimeChannel, parseClockOrDate, pickTime, toRelativeSeconds } from './time';

export interface CsvParseOptions {
  fileName: string;
  encoding: TextEncodingName;
  onProgress?: (fraction: number) => void;
}

type ColumnKind = 'numeric' | 'text' | 'datetime';

interface CsvLayout {
  delimiter: Delimiter;
  decimal: '.' | ',';
  preambleLines: number;
  hasHeader: boolean;
  hasUnitsRow: boolean;
  columnCount: number;
  kinds: ColumnKind[];
}

const SNIFF_LINES = 1200;
const NUMERIC_THRESHOLD = 0.9;
const PROGRESS_EVERY = 20_000;
/** Far beyond any real logger; stops a malformed file from allocating a buffer per bogus column. */
const MAX_COLUMNS = 4096;

const PAPA_ROWS = { skipEmptyLines: 'greedy' } as const;

/** The first `max` non-empty lines, without splitting the whole text. */
export function firstLines(text: string, max: number): string[] {
  const lines: string[] = [];
  let start = 0;
  while (lines.length < max && start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    if (line.trim() !== '') lines.push(line);
    start = end + 1;
  }
  return lines;
}

function classifyColumn(cells: string[], decimal: '.' | ',', header: string): ColumnKind {
  const nonBlank = cells.filter((c) => !isBlankOrPlaceholder(c));
  if (nonBlank.length === 0) return 'numeric';
  if (numericFraction(nonBlank, decimal) >= NUMERIC_THRESHOLD) return 'numeric';
  const { name, unit } = splitHeaderUnit(header);
  if (isTimeChannel(name, unit)) {
    const dated = nonBlank.filter((c) => !Number.isNaN(parseClockOrDate(c))).length;
    if (dated / nonBlank.length >= NUMERIC_THRESHOLD) return 'datetime';
  }
  return 'text';
}

/**
 * `headRows` must come from the same Papa Parse settings as the full parse, so row indices here
 * (preamble length, header, units row) line up exactly with the rows the parser later streams.
 */
export function sniffLayout(headRows: string[][], delimiter: Delimiter): CsvLayout {
  const preambleLines = findHeaderIndex(headRows);
  const rows = headRows.slice(preambleLines);
  const decimal = detectDecimalComma(rows, delimiter) ? ',' : '.';

  const hasHeader = rows.length > 0 && numericFraction(rows[0], decimal) < 0.5;
  const hasUnitsRow =
    hasHeader &&
    rows.length > 2 &&
    numericFraction(rows[1], decimal) < 0.5 &&
    numericFraction(rows[2], decimal) >= 0.5;

  const sample = rows.slice((hasHeader ? 1 : 0) + (hasUnitsRow ? 1 : 0));
  // Trailing blank cells (a delimiter at the end of each line) are not extra columns.
  const columnCount = hasHeader ? effectiveLength(rows[0]) : modalEffectiveLength(rows);
  const headers = hasHeader ? rows[0] : [];
  const kinds = Array.from({ length: columnCount }, (_, c) =>
    classifyColumn(
      sample.map((r) => r[c] ?? ''),
      decimal,
      headers[c] ?? '',
    ),
  );
  return { delimiter, decimal, preambleLines, hasHeader, hasUnitsRow, columnCount, kinds };
}

function uniqueHeader(base: string, seen: Map<string, number>): string {
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base} #${n}`;
}

export function parseCsvText(text: string, opts: CsvParseOptions): Log {
  const lines = firstLines(text, SNIFF_LINES);
  if (lines.length === 0) throw new LogParseError('empty', `"${opts.fileName}" is empty.`);
  const delimiter = detectDelimiter(lines);

  try {
    return parseWithQuoting(text, opts, delimiter, '"');
  } catch (err) {
    if (err !== UNBALANCED_QUOTES) throw err;
  }
  // An unbalanced quote makes Papa Parse fold every following line into one cell. Logs rarely
  // need quoting, so losing it beats silently losing rows.
  const log = parseWithQuoting(text, opts, delimiter, NO_QUOTE);
  log.meta.warnings.unshift({
    code: 'quotes-ignored',
    message: 'Some quotes in this file are unbalanced, so quote marks were read as ordinary text.',
  });
  return log;
}

const NO_QUOTE = '\u0000';
const UNBALANCED_QUOTES = Symbol('unbalanced quotes');

const hasQuoteError = (errors: Papa.ParseError[]) => errors.some((e) => e.type === 'Quotes');

function parseWithQuoting(
  text: string,
  opts: CsvParseOptions,
  delimiter: Delimiter,
  quoteChar: string,
): Log {
  const quoting = quoteChar !== NO_QUOTE;
  const head = Papa.parse<string[]>(text, {
    ...PAPA_ROWS,
    delimiter,
    quoteChar,
    preview: SNIFF_LINES,
  });
  if (quoting && hasQuoteError(head.errors)) throw UNBALANCED_QUOTES;
  const headRows = head.data;
  if (headRows.length === 0) throw new LogParseError('empty', `"${opts.fileName}" is empty.`);
  const layout = sniffLayout(headRows, delimiter);
  const { columnCount, kinds, decimal } = layout;
  if (columnCount > MAX_COLUMNS) {
    throw new LogParseError(
      'unsupported',
      `"${opts.fileName}" has ${columnCount.toLocaleString('en-US')} columns; DataLogViewer supports up to ${MAX_COLUMNS.toLocaleString('en-US')}.`,
    );
  }
  const headerRow = layout.preambleLines;
  const unitsRow = layout.hasUnitsRow ? headerRow + 1 : -1;

  const numeric = kinds.map((k) => (k === 'text' ? null : new GrowableF64()));
  const texts = kinds.map((k) => (k === 'text' ? ([] as string[]) : null));
  const badCells = new Array<number>(columnCount).fill(0);
  const preamble: string[] = [];
  let headers: string[] = [];
  let units: string[] = [];
  let rowIndex = 0;
  let dataRows = 0;
  let short = 0;
  let long = 0;
  let firstShort = 0;
  let firstLong = 0;
  let quoteTrouble = false;

  Papa.parse<string[]>(text, {
    ...PAPA_ROWS,
    delimiter,
    quoteChar,
    step: (result, parser) => {
      if (quoting && hasQuoteError(result.errors)) {
        quoteTrouble = true;
        parser.abort();
        return;
      }
      const row = result.data;
      const r = rowIndex++;
      if (r < headerRow) {
        preamble.push(row.join(delimiter));
        return;
      }
      if (layout.hasHeader && r === headerRow) {
        headers = row;
        return;
      }
      if (r === unitsRow) {
        units = row;
        return;
      }

      if (row.length < columnCount) {
        if (short++ === 0) firstShort = r + 1;
      } else if (row.length > columnCount && effectiveLength(row) > columnCount) {
        if (long++ === 0) firstLong = r + 1;
      }
      for (let c = 0; c < columnCount; c++) {
        const cell = row[c] ?? '';
        const kind = kinds[c];
        if (kind === 'text') {
          texts[c]!.push(cell);
          continue;
        }
        const v = kind === 'numeric' ? parseNumber(cell, decimal) : parseClockOrDate(cell);
        if (Number.isNaN(v) && !isBlankOrPlaceholder(cell)) badCells[c]++;
        numeric[c]!.push(v);
      }

      dataRows++;
      if (opts.onProgress && dataRows % PROGRESS_EVERY === 0) {
        opts.onProgress(Math.min(result.meta.cursor / text.length, 0.99));
      }
    },
  });

  if (quoteTrouble) throw UNBALANCED_QUOTES;
  if (dataRows === 0) {
    throw new LogParseError('empty', `"${opts.fileName}" has no data rows.`);
  }

  const warnings: ParseWarning[] = [];
  if (short) {
    warnings.push({
      code: 'short-rows',
      message: `${short} row(s) had fewer than ${columnCount} columns; missing cells are shown as gaps.`,
      count: short,
      firstRow: firstShort,
    });
  }
  if (long) {
    warnings.push({
      code: 'long-rows',
      message: `${long} row(s) had more than ${columnCount} columns; the extra cells were ignored.`,
      count: long,
      firstRow: firstLong,
    });
  }

  const channels: Channel[] = [];
  const datetimeIds = new Set<string>();
  const seen = new Map<string, number>();
  for (let c = 0; c < columnCount; c++) {
    // Room is left for uniqueHeader's " #N" suffix.
    const rawHeader = (headers[c] ?? '').trim().slice(0, MAX_HEADER_CHARS - 8);
    let values = numeric[c]?.toArray() ?? null;
    const columnText = texts[c];
    const empty = values ? values.every(Number.isNaN) : columnText!.every((t) => t.trim() === '');
    if (rawHeader === '' && empty) continue; // spreadsheet padding columns

    const header = uniqueHeader(rawHeader || `Column ${c + 1}`, seen);
    const split = splitHeaderUnit(header);
    const unitCell = (units[c] ?? '').trim();
    const id = `c${c}`;
    if (kinds[c] === 'datetime' && values) {
      values = toRelativeSeconds(values, 1);
      datetimeIds.add(id);
    }
    if (badCells[c]) {
      warnings.push({
        code: 'non-numeric-cells',
        message: `${badCells[c]} cell(s) in "${header}" weren't numbers and are shown as gaps.`,
        count: badCells[c],
      });
    }
    const { min, max } = values ? finiteMinMax(values) : { min: NaN, max: NaN };
    channels.push({
      id,
      header,
      name: split.name,
      unit: unitCell || split.unit,
      kind: values ? 'numeric' : 'text',
      values,
      text: columnText,
      min,
      max,
    });
  }

  if (!channels.some((ch) => ch.kind === 'numeric')) {
    throw new LogParseError(
      'no-numeric-columns',
      `No numeric columns found in "${opts.fileName}". Columns detected: ${channels.map((c) => c.header).join(', ')}.`,
    );
  }

  const { time, timeSource, warning } = pickTime(channels, datetimeIds, dataRows);
  if (warning) warnings.push(warning);
  opts.onProgress?.(1);

  return {
    id: crypto.randomUUID(),
    fileName: opts.fileName,
    rowCount: dataRows,
    time,
    timeSource,
    channels,
    meta: { delimiter, decimal, encoding: opts.encoding, preamble, warnings },
  };
}
