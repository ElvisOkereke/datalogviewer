import type { Channel, Log } from './types';

const TRAILING_UNIT = /^(.*?)\s*[([]\s*([^()[\]]+?)\s*[)\]]$/;

/** "MAP (kPa)" / "MAP [kPa]" → { name: "MAP", unit: "kPa" }. */
export function splitHeaderUnit(header: string): { name: string; unit?: string } {
  const trimmed = header.trim();
  const m = TRAILING_UNIT.exec(trimmed);
  if (m && m[1]) return { name: m[1], unit: m[2] };
  return { name: trimmed };
}

/** Re-binds a saved series to a channel: exact header first, then case-insensitive name. */
export function findChannel(log: Log, header: string): Channel | undefined {
  const exact = log.channels.find((c) => c.header === header);
  if (exact) return exact;
  const name = splitHeaderUnit(header).name.toLowerCase();
  return log.channels.find((c) => c.name.toLowerCase() === name);
}
