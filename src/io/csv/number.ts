/** Parses a CSV cell as a finite number; NaN for blank or non-numeric cells. */
export function parseNumber(cell: string, decimal: '.' | ','): number {
  let s = cell.trim();
  if (s === '') return NaN;
  if (decimal === ',') s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** What loggers and spreadsheets write when a sensor has no reading yet (e.g. wideband warm-up). */
const PLACEHOLDER = /^(-+|\?+|n\/?a|nan|null|none|#n\/a|#value!|#div\/0!)$/i;

export function isBlankOrPlaceholder(cell: string): boolean {
  const s = cell.trim();
  return s === '' || PLACEHOLDER.test(s);
}
