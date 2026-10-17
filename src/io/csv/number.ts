/** Parses a CSV cell as a finite number; NaN for blank or non-numeric cells. */
export function parseNumber(cell: string, decimal: '.' | ','): number {
  let s = cell.trim();
  if (s === '') return NaN;
  if (decimal === ',') s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
